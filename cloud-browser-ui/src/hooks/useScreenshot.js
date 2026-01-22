// Screenshot streaming hook

import { useState, useEffect, useRef } from "react";

export function useScreenshot(socketRef, activeTab) {
  const [screenshot, setScreenshot] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const latestScreenshotRef = useRef(null);
  const screenshotFrameRef = useRef(null);

  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;

    // Handle binary screenshot data (more efficient)
    let frameReceiveCount = 0;
    let lastReceiveTime = Date.now();
    
    const handleScreenshotBinary = ({ tabId, image }) => {
      const receiveTime = Date.now();
      frameReceiveCount++;
      
      if (tabId === activeTab && image) {
        // Use Blob URL for better performance (avoids base64 conversion overhead)
        const blob = new Blob([image], { type: 'image/jpeg' });
        const dataUrl = URL.createObjectURL(blob);
        
        // Clean up old blob URL to prevent memory leaks
        if (latestScreenshotRef.current?.blobUrl) {
          URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
        }
        
        // UDP-like behavior: only keep the latest frame
        latestScreenshotRef.current = {
          tabId,
          image: dataUrl,
          blobUrl: dataUrl, // Store for cleanup
          timestamp: receiveTime
        };
        
        // Log performance every 60 frames (for debugging)
        if (frameReceiveCount % 60 === 0) {
          const elapsed = (receiveTime - lastReceiveTime) / 1000;
          const fps = Math.round((60 / elapsed) * 10) / 10;
          const sizeKB = Math.round(image.length / 1024);
          console.log(`[Client] Received ${frameReceiveCount} frames (${fps} FPS), ~${sizeKB}KB/frame`);
          lastReceiveTime = receiveTime;
        }
        
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
      // Cleanup blob URLs
      if (latestScreenshotRef.current?.blobUrl) {
        URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
      }
    };
  }, [socketRef, activeTab]);

  // Clear screenshot when tab changes
  useEffect(() => {
    // Cancel any pending screenshot updates when tab changes
    if (screenshotFrameRef.current) {
      cancelAnimationFrame(screenshotFrameRef.current);
      screenshotFrameRef.current = null;
    }
    
    const prevTab = latestScreenshotRef.current?.tabId;
    if (prevTab && prevTab !== activeTab) {
      latestScreenshotRef.current = null;
      // Keep screenshot visible until new one arrives (don't clear immediately)
    }
    
    if (!activeTab) {
      setScreenshot(null);
      latestScreenshotRef.current = null;
    }
  }, [activeTab]);

  return { screenshot, isLoading, setIsLoading };
}
