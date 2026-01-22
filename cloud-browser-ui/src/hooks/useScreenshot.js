// Screenshot streaming hook with Google Meet-like optimizations

import { useState, useEffect, useRef } from "react";

export function useScreenshot(socketRef, activeTab) {
  const [screenshot, setScreenshot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const latestScreenshotRef = useRef(null);
  const screenshotFrameRef = useRef(null);
  const imageBitmapRef = useRef(null);
  const frameQueueRef = useRef([]);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;

    // Handle binary screenshot data with optimized processing
    let frameReceiveCount = 0;
    let lastReceiveTime = Date.now();
    let droppedFrames = 0;
    
    const processFrameQueue = async () => {
      if (isProcessingRef.current || frameQueueRef.current.length === 0) {
        return;
      }

      isProcessingRef.current = true;

      // Google Meet style: Only process the latest frame, drop all others
      const frames = frameQueueRef.current;
      frameQueueRef.current = []; // Clear queue
      
      if (frames.length === 0) {
        isProcessingRef.current = false;
        return;
      }

      // Get the latest frame (most recent)
      const latestFrame = frames[frames.length - 1];
      droppedFrames += frames.length - 1; // Count dropped frames

      if (latestFrame.tabId === activeTab && latestFrame.image) {
        try {
          // Use ImageBitmap API for faster decoding (if available)
          if (typeof createImageBitmap !== 'undefined' && latestFrame.image instanceof Blob) {
            // Clean up old ImageBitmap
            if (imageBitmapRef.current) {
              imageBitmapRef.current.close();
            }

            // Create ImageBitmap for hardware-accelerated rendering
            const bitmap = await createImageBitmap(latestFrame.image);
            imageBitmapRef.current = bitmap;

            // Create canvas to convert ImageBitmap to data URL
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            
            // Clean up old blob URL
            if (latestScreenshotRef.current?.blobUrl) {
              URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
            }
            
            latestScreenshotRef.current = {
              tabId: latestFrame.tabId,
              image: dataUrl,
              blobUrl: null,
              timestamp: latestFrame.timestamp,
              frameId: latestFrame.frameId
            };
          } else {
            // Fallback: Use Blob URL (still efficient)
            const blob = latestFrame.image instanceof Blob 
              ? latestFrame.image 
              : new Blob([latestFrame.image], { type: 'image/jpeg' });
            const dataUrl = URL.createObjectURL(blob);
            
            // Clean up old blob URL
            if (latestScreenshotRef.current?.blobUrl) {
              URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
            }
            
            latestScreenshotRef.current = {
              tabId: latestFrame.tabId,
              image: dataUrl,
              blobUrl: dataUrl,
              timestamp: latestFrame.timestamp,
              frameId: latestFrame.frameId
            };
          }

          // Cancel any pending frame update
          if (screenshotFrameRef.current) {
            cancelAnimationFrame(screenshotFrameRef.current);
          }

          // Schedule update for next animation frame (smooth rendering)
          screenshotFrameRef.current = requestAnimationFrame(() => {
            if (latestScreenshotRef.current && latestScreenshotRef.current.tabId === activeTab) {
              setScreenshot(latestScreenshotRef.current.image);
              setIsLoading(false);
              screenshotFrameRef.current = null;
            }
            isProcessingRef.current = false;
          });
        } catch (error) {
          console.error("Error processing frame:", error);
          isProcessingRef.current = false;
        }
      } else {
        isProcessingRef.current = false;
      }
    };
    
    const handleScreenshotBinary = async ({ tabId, image, frameId, timestamp, compressed }) => {
      const receiveTime = timestamp || Date.now();
      frameReceiveCount++;
      
      if (tabId === activeTab && image) {
        let imageBlob;
        
        // Handle compressed frames
        if (compressed) {
          try {
            // Check if DecompressionStream is available (Chrome 80+, Firefox 113+, Safari 16.4+)
            if (typeof DecompressionStream !== 'undefined') {
              // Decompress gzip data using modern DecompressionStream API
              const stream = new DecompressionStream('gzip');
              const writer = stream.writable.getWriter();
              const reader = stream.readable.getReader();
              
              // Write compressed data
              const imageArray = image instanceof ArrayBuffer 
                ? new Uint8Array(image) 
                : image instanceof Uint8Array
                ? image
                : new Uint8Array(image.buffer || image);
              writer.write(imageArray);
              writer.close();
              
              // Read decompressed data
              const chunks = [];
              let done = false;
              while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) chunks.push(value);
              }
              
              // Combine chunks into single Uint8Array
              const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
              const decompressed = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of chunks) {
                decompressed.set(chunk, offset);
                offset += chunk.length;
              }
              
              imageBlob = new Blob([decompressed], { type: 'image/jpeg' });
            } else {
              // Fallback for older browsers: treat as uncompressed
              // Note: In production, you might want to use pako library for decompression
              console.warn("DecompressionStream not supported, treating as uncompressed");
              imageBlob = image instanceof Blob 
                ? image 
                : new Blob([image], { type: 'image/jpeg' });
            }
          } catch (decompressError) {
            console.warn("Decompression failed, trying as uncompressed:", decompressError);
            // Fallback: treat as uncompressed
            imageBlob = image instanceof Blob 
              ? image 
              : new Blob([image], { type: 'image/jpeg' });
          }
        } else {
          // Uncompressed frame
          imageBlob = image instanceof Blob 
            ? image 
            : new Blob([image], { type: 'image/jpeg' });
        }

        // Add to queue (will be processed asynchronously)
        frameQueueRef.current.push({
          tabId,
          image: imageBlob,
          frameId: frameId || frameReceiveCount,
          timestamp: receiveTime
        });

        // Process queue (will drop old frames automatically)
        processFrameQueue();

        // Log performance every 60 frames
        if (frameReceiveCount % 60 === 0) {
          const elapsed = (receiveTime - lastReceiveTime) / 1000;
          const fps = Math.round((60 / elapsed) * 10) / 10;
          const sizeKB = Math.round((imageBlob.size || image.length || 0) / 1024);
          console.log(`[Client] Received ${frameReceiveCount} frames (${fps} FPS), ${droppedFrames} dropped, ~${sizeKB}KB/frame`);
          lastReceiveTime = receiveTime;
          droppedFrames = 0; // Reset counter
        }
      }
    };

    // Fallback: handle base64 screenshot (for compatibility)
    const handleScreenshot = ({ tabId, image }) => {
      if (tabId === activeTab) {
        // UDP-like behavior: only keep the latest frame
        latestScreenshotRef.current = {
          tabId,
          image: `data:image/jpeg;base64,${image}`,
          timestamp: Date.now()
        };
        
        // Cancel any pending frame update
        if (screenshotFrameRef.current) {
          cancelAnimationFrame(screenshotFrameRef.current);
        }
        
        // Schedule update for next frame (only latest will be rendered)
        screenshotFrameRef.current = requestAnimationFrame(() => {
          if (latestScreenshotRef.current && latestScreenshotRef.current.tabId === tabId) {
            setScreenshot(latestScreenshotRef.current.image);
            setIsLoading(false);
            screenshotFrameRef.current = null;
          }
        });
      }
    };

    socket.on("screenshot_binary", handleScreenshotBinary);
    socket.on("screenshot", handleScreenshot);

    return () => {
      socket.off("screenshot_binary", handleScreenshotBinary);
      socket.off("screenshot", handleScreenshot);
      // Cleanup animation frame
      if (screenshotFrameRef.current) {
        cancelAnimationFrame(screenshotFrameRef.current);
      }
      // Cleanup ImageBitmap
      if (imageBitmapRef.current) {
        imageBitmapRef.current.close();
        imageBitmapRef.current = null;
      }
      // Cleanup blob URLs
      if (latestScreenshotRef.current?.blobUrl) {
        URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
      }
      // Clear frame queue
      frameQueueRef.current = [];
      isProcessingRef.current = false;
    };
  }, [socketRef, activeTab]);

  // Clear screenshot when tab changes
  useEffect(() => {
    // Cancel any pending screenshot updates when tab changes
    if (screenshotFrameRef.current) {
      cancelAnimationFrame(screenshotFrameRef.current);
      screenshotFrameRef.current = null;
    }
    
    // Clear frame queue when tab changes
    frameQueueRef.current = [];
    isProcessingRef.current = false;
    
    const prevTab = latestScreenshotRef.current?.tabId;
    if (prevTab && prevTab !== activeTab) {
      // Cleanup ImageBitmap
      if (imageBitmapRef.current) {
        imageBitmapRef.current.close();
        imageBitmapRef.current = null;
      }
      // Cleanup blob URL
      if (latestScreenshotRef.current?.blobUrl) {
        URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
      }
      latestScreenshotRef.current = null;
      // Keep screenshot visible until new one arrives (don't clear immediately)
    }
    
    if (!activeTab) {
      setScreenshot(null);
      if (imageBitmapRef.current) {
        imageBitmapRef.current.close();
        imageBitmapRef.current = null;
      }
      if (latestScreenshotRef.current?.blobUrl) {
        URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
      }
      latestScreenshotRef.current = null;
    }
  }, [activeTab]);

  return { screenshot, isLoading, setIsLoading };
}
