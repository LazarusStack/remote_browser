// CDP Screencast management with optimized frame delivery

import { config } from '../config/index.js';
import zlib from 'zlib';
import { promisify } from 'util';
import crypto from 'crypto';

const gzip = promisify(zlib.gzip);

// Per-client frame tracking to prevent overwhelming slow connections
const clientFrameQueues = new Map(); // socketId -> { pendingFrames, lastSentTime, isProcessing }

/**
 * Start CDP screencast for a tab
 */
export async function startCDPScreencast(socket, tabId, browserInstance, io) {
  const page = browserInstance.pages[tabId];
  if (!page || page.isClosed()) return;

  // Add this socket to the viewers of this tab
  if (!browserInstance.tabViewers[tabId]) {
    browserInstance.tabViewers[tabId] = new Set();
  }
  browserInstance.tabViewers[tabId].add(socket.id);

  // Initialize client frame tracking
  if (!clientFrameQueues.has(socket.id)) {
    clientFrameQueues.set(socket.id, {
      pendingFrames: 0,
      lastSentTime: 0,
      isProcessing: false
    });
  }

  // Stop existing screencast for this tab if any
  if (browserInstance.screencastActive[tabId]) {
    await stopCDPScreencast(tabId, browserInstance);
  }

  try {
    // Get or create CDP session for this page
    let cdpSession = browserInstance.cdpSessions[tabId];
    if (!cdpSession) {
      // Create CDP session from the page
      cdpSession = await page.context().newCDPSession(page);
      browserInstance.cdpSessions[tabId] = cdpSession;

      // Track latest frame to drop stale ones (Google Meet style)
      let latestFrame = null;
      let latestFrameId = 0;
      let frameProcessing = false;
      
      // Hash-based frame skipping: track last frame hash to skip unchanged frames
      let lastFrameHash = null;
      let duplicateFrames = 0;
      
      // Listen for screencast frames with smart throttling
      let lastFrameTime = 0;
      let frameCount = 0;
      let skippedFrames = 0;
      let startTime = Date.now();
      const minFrameInterval = config.screencast.minFrameInterval;
      
      cdpSession.on('Page.screencastFrame', (event) => {
        if (!browserInstance.screencastActive[tabId] || !browserInstance.pages[tabId] || browserInstance.pages[tabId].isClosed()) {
          return;
        }

        // Fire and forget: acknowledge immediately without blocking (hot path optimization)
        const { sessionId, data } = event;
        cdpSession.send('Page.screencastFrameAck', { sessionId }).catch(() => {});

        // Hash-based frame skipping: skip identical frames (do this before any async work)
        const frameHash = crypto.createHash('md5').update(data).digest('hex');
        if (frameHash === lastFrameHash) {
          duplicateFrames++;
          return; // Skip identical frame
        }
        lastFrameHash = frameHash;

        // If we're still processing the last frame, drop this one (UDP-like behavior)
        if (frameProcessing) {
          skippedFrames++;
          return;
        }

        // Throttle frames to prevent overwhelming the network
        const now = Date.now();
        if (now - lastFrameTime < minFrameInterval) {
          skippedFrames++;
          return;
        }
        lastFrameTime = now;
        frameCount++;
        frameProcessing = true;

        // Process frame asynchronously (don't block the event handler)
        (async () => {
          try {
            // Convert base64 to Buffer for efficient binary transfer (parallel with ack)
            const imageBuffer = Buffer.from(data, 'base64');
          
            // Compress the frame using gzip (fast compression level 1) - non-blocking
            let compressedBuffer;
            let isCompressed = false;
            try {
              // Only compress if frame is larger than 10KB (compression overhead not worth it for small frames)
              if (imageBuffer.length > 10240) {
                compressedBuffer = await gzip(imageBuffer, { level: 1 }); // Fast compression
                // Only use compressed if it's actually smaller
                if (compressedBuffer.length < imageBuffer.length * 0.9) {
                  isCompressed = true;
                } else {
                  compressedBuffer = imageBuffer;
                }
              } else {
                compressedBuffer = imageBuffer;
              }
            } catch (compressionError) {
              // If compression fails, use original buffer
              compressedBuffer = imageBuffer;
              // Don't log warnings in hot path - silent fail
            }
            
            latestFrameId++;
            const currentFrameId = latestFrameId;
            
            // Store as latest frame (will be sent to clients)
            latestFrame = {
              frameId: currentFrameId,
              imageBuffer,
              timestamp: now
            };

            // Broadcast to all viewers with smart queue management
            const viewers = browserInstance.tabViewers[tabId] || new Set();
            const sendPromises = [];
            
            viewers.forEach(socketId => {
              const viewerSocket = io.sockets.sockets.get(socketId);
              if (!viewerSocket || !viewerSocket.connected) {
                // Clean up disconnected viewers
                viewers.delete(socketId);
                clientFrameQueues.delete(socketId);
                return;
              }

              const clientQueue = clientFrameQueues.get(socketId);
              if (!clientQueue) return;

              // Skip if client has too many pending frames (backpressure)
              if (clientQueue.pendingFrames > 2) {
                return; // Client is slow, skip this frame
              }

              // Check if we should send (respect client's processing rate)
              const timeSinceLastSend = now - clientQueue.lastSentTime;
              if (timeSinceLastSend < minFrameInterval && clientQueue.pendingFrames > 0) {
                return; // Too soon, client still processing
              }

              // Mark as pending
              clientQueue.pendingFrames++;
              clientQueue.lastSentTime = now;

              // Send frame asynchronously
              const sendPromise = new Promise((resolve) => {
                // Use volatile emit for better performance (don't queue if socket is busy)
                const sent = viewerSocket.volatile.emit("screenshot_binary", {
                  tabId,
                  image: compressedBuffer,
                  frameId: currentFrameId,
                  timestamp: now,
                  compressed: isCompressed
                });

                if (sent) {
                  // Frame sent successfully, will be decremented when client acknowledges
                  // For now, we'll use a timeout to decrement (client might not acknowledge)
                  setTimeout(() => {
                    clientQueue.pendingFrames = Math.max(0, clientQueue.pendingFrames - 1);
                    resolve();
                  }, minFrameInterval);
                } else {
                  // Socket is busy, decrement immediately
                  clientQueue.pendingFrames = Math.max(0, clientQueue.pendingFrames - 1);
                  resolve();
                }
              });

              sendPromises.push(sendPromise);
            });

            // Wait for all sends to complete (non-blocking)
            Promise.all(sendPromises).catch(() => {});

            // Log performance stats every 60 frames
            if (frameCount % 60 === 0) {
              const elapsed = (Date.now() - startTime) / 1000;
              const fps = Math.round((frameCount / elapsed) * 10) / 10;
              const originalSizeKB = Math.round(imageBuffer.length / 1024);
              const compressedSizeKB = Math.round(compressedBuffer.length / 1024);
              const compressionRatio = isCompressed 
                ? Math.round((1 - compressedBuffer.length / imageBuffer.length) * 100) 
                : 0;
              const activeViewers = viewers.size;
              console.log(
                `Tab ${tabId}: ${frameCount} frames (${fps} FPS), ${skippedFrames} dropped, ${duplicateFrames} duplicates, ` +
                `~${originalSizeKB}KB→${compressedSizeKB}KB${isCompressed ? ` (${compressionRatio}% saved)` : ''}/frame, ${activeViewers} viewers`
              );
              duplicateFrames = 0; // Reset counter
            }

            frameProcessing = false;
          } catch (error) {
            frameProcessing = false;
            // Silently handle errors - page might be closing
            if (!error.message.includes('closed') && !error.message.includes('Target closed')) {
              console.error("Error processing screencast frame:", error.message);
            }
          }
        })(); // Execute async function immediately
      });

      // Handle CDP session errors
      cdpSession.on('error', (error) => {
        console.error("CDP session error:", error.message);
        delete browserInstance.cdpSessions[tabId];
        browserInstance.screencastActive[tabId] = false;
      });
    }

    // Start screencast with optimized settings
    await cdpSession.send('Page.startScreencast', {
      format: config.screencast.format,
      quality: config.screencast.quality,
      maxWidth: config.screencast.maxWidth,
      maxHeight: config.screencast.maxHeight,
      everyNthFrame: config.screencast.everyNthFrame
    });

    browserInstance.screencastActive[tabId] = true;
  } catch (error) {
    console.error("Error starting CDP screencast:", error.message);
    browserInstance.screencastActive[tabId] = false;
  }
}

/**
 * Stop CDP screencast for a tab
 */
export async function stopCDPScreencast(tabId, browserInstance) {
  try {
    const cdpSession = browserInstance.cdpSessions[tabId];
    if (cdpSession && browserInstance.screencastActive[tabId]) {
      await cdpSession.send('Page.stopScreencast');
      browserInstance.screencastActive[tabId] = false;
    }
  } catch (error) {
    console.error("Error stopping CDP screencast:", error.message);
  }
}

/**
 * Clean up client frame tracking when socket disconnects
 */
export function cleanupClientFrameQueue(socketId) {
  clientFrameQueues.delete(socketId);
}
