// CDP Screencast management with optimized frame delivery

import { config } from '../config/index.js';
import { sendBinary, findWebSocketById, getClientSockets, getConnectionInfo } from '../websocket/wsServer.js';

// Fast frame signature for duplicate detection (< 1ms vs 5-15ms for MD5)
function quickFrameSignature(data) {
  const len = data.length;
  // Check length + first/middle/last 100 chars (very fast string comparison)
  return `${len}-${data.slice(0, 100)}-${data.slice(Math.floor(len / 2), Math.floor(len / 2) + 100)}-${data.slice(-100)}`;
}

// Fixed header size for binary frames (no JSON parsing needed)
const HEADER_SIZE = 20; // 4 bytes payload size + 4 bytes tabId hash + 4 bytes frameId + 8 bytes timestamp

// Per-client frame tracking to prevent overwhelming slow connections
const clientFrameQueues = new Map(); // socketId -> { pendingFrames, lastSentTime, isProcessing }


/**
 * Start CDP screencast for a tab
 */
export async function startCDPScreencast(socket, tabId, browserInstance, wss) {
  const page = browserInstance.pages[tabId];
  if (!page || page.isClosed()) return;

  // Add this socket to the viewers of this tab
  if (!browserInstance.tabViewers[tabId]) {
    browserInstance.tabViewers[tabId] = new Set();
  }

  // Track by clientId if available, otherwise by socketId
  const connInfo = getConnectionInfo(socket);
  const viewerId = connInfo.clientId || socket.id;
  browserInstance.tabViewers[tabId].add(viewerId);

  // Initialize client frame tracking

  if (!clientFrameQueues.has(viewerId)) {
    clientFrameQueues.set(viewerId, {
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

      // Fast frame signature for duplicate detection (much faster than MD5)
      let lastFrameSignature = null;
      let duplicateFrames = 0;

      // Pre-allocate header buffer (reused for every frame)
      const headerBuffer = Buffer.alloc(HEADER_SIZE);

      // Listen for screencast frames
      let lastFrameTime = 0;
      let frameCount = 0;
      let skippedFrames = 0;
      let startTime = Date.now();
      let lastCDPFrameTime = Date.now();
      let cdpFrameIntervals = [];


      // Adaptive frame skipping for video content
      let recentFrameSizes = []; // Track last 10 frame sizes
      let isVideoMode = false; // Detected video playback
      const VIDEO_DETECTION_THRESHOLD = 50 * 1024; // 50KB - frames larger than this suggest video
      const MAX_FRAME_SIZES_TO_TRACK = 10;

      // Latency tracking
      let latencyStats = {
        total: 0,
        min: Infinity,
        max: 0,
        count: 0
      };

      cdpSession.on('Page.screencastFrame', (event) => {
        // Track CDP frame arrival rate
        const now = Date.now();
        const cdpInterval = now - lastCDPFrameTime;
        lastCDPFrameTime = now;
        if (cdpFrameIntervals.length < 60) {
          cdpFrameIntervals.push(cdpInterval);
        }
        if (!browserInstance.screencastActive[tabId] || !browserInstance.pages[tabId] || browserInstance.pages[tabId].isClosed()) {
          return;
        }

        // Fire and forget: acknowledge immediately without blocking (hot path optimization)
        const { sessionId, data } = event;
        cdpSession.send('Page.screencastFrameAck', { sessionId }).catch(() => { });

        // Fast frame signature check: skip identical frames (< 1ms vs 5-15ms for MD5)
        const frameSignature = quickFrameSignature(data);
        if (frameSignature === lastFrameSignature) {
          duplicateFrames++;
          return; // Skip identical frame
        }
        lastFrameSignature = frameSignature;

        // Quick size check before processing (estimate from base64 length)
        const estimatedSize = (data.length * 3) / 4; // Base64 to binary estimate

        // Update frame size tracking for video detection
        recentFrameSizes.push(estimatedSize);
        if (recentFrameSizes.length > MAX_FRAME_SIZES_TO_TRACK) {
          recentFrameSizes.shift();
        }

        // Detect video mode: if average of recent frames is large, we're likely showing video
        const avgFrameSize = recentFrameSizes.reduce((a, b) => a + b, 0) / recentFrameSizes.length;
        isVideoMode = avgFrameSize > VIDEO_DETECTION_THRESHOLD;

        // REMOVED: Artificial frame skipping
        // We now rely on multi-socket throughput and client backpressure

        // If we're still processing the last frame, drop this one (UDP-like behavior)
        // Be more aggressive with dropping when in video mode
        if (frameProcessing) {
          skippedFrames++;
          return;
        }

        // Don't throttle - CDP encoding is already the bottleneck
        // If CDP sends frames slowly, we want to process them immediately
        // 'now' is already declared above for CDP frame tracking
        frameCount++;
        lastFrameTime = now;
        frameProcessing = true;

        // Process frame asynchronously (don't block the event handler)
        (async () => {
          const frameStartTime = Date.now(); // Track frame processing start
          try {
            // Convert base64 to Buffer for efficient binary transfer (parallel with ack)
            const decodeStart = Date.now();
            const imageBuffer = Buffer.from(data, 'base64');
            const decodeTime = Date.now() - decodeStart;

            // Skip compression - JPEG is already compressed, gzip adds 10-30ms latency for minimal benefit
            // Just use the raw buffer directly

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

            viewers.forEach(viewerId => {
              // Get all sockets for this viewer (clientId or socketId)
              let targetSockets = [];
              const clientSockets = getClientSockets(viewerId);

              if (clientSockets.size > 0) {
                // Convert Set to Array for indexing
                targetSockets = Array.from(clientSockets);
              } else {
                // Fallback for direct socket ID (legacy) or single socket
                const ws = findWebSocketById(viewerId);
                if (ws && ws.readyState === 1) targetSockets.push(ws);
              }

              if (targetSockets.length === 0) {
                // Clean up disconnected viewers
                viewers.delete(viewerId);
                clientFrameQueues.delete(viewerId);
                return;
              }

              const clientQueue = clientFrameQueues.get(viewerId);
              if (!clientQueue) return;

              // Adaptive backpressure: be more aggressive when frames are large (video)
              const backpressureThreshold = isVideoMode ? 1 : 2; // Lower threshold for video
              if (clientQueue.pendingFrames > backpressureThreshold) {
                skippedFrames++;
                return; // Client is slow, skip this frame
              }

              // Don't throttle per-client - CDP is already slow enough
              // Just check backpressure (pending frames)

              // Mark as pending
              clientQueue.pendingFrames++;
              clientQueue.lastSentTime = now;

              // ROUND-ROBIN STRIPING: Select socket based on frameId
              // Frame 1 -> Socket 0, Frame 2 -> Socket 1, etc.
              const socketIndex = currentFrameId % targetSockets.length;
              const targetWS = targetSockets[socketIndex];

              // Only send if this specific socket is open
              if (targetWS.readyState !== 1) {
                clientQueue.pendingFrames = Math.max(0, clientQueue.pendingFrames - 1);
                return;
              }

              // Send binary frame with pre-allocated fixed header (no JSON parsing needed)
              try {
                const sendStart = Date.now();

                // Create numeric tab ID hash (extract number from "tab_123" -> 123)
                // This is faster than string comparison and works with tab_${counter} format
                const tabIdHash = parseInt(tabId.replace(/^tab_/, '')) || 0;

                // Write fixed-size header (single allocation, no JSON)
                headerBuffer.writeUInt32BE(imageBuffer.length, 0);  // 4 bytes: payload size
                headerBuffer.writeUInt32BE(tabIdHash, 4);          // 4 bytes: tab ID hash
                headerBuffer.writeUInt32BE(currentFrameId, 8);      // 4 bytes: frame ID
                headerBuffer.writeBigUInt64BE(BigInt(now), 12);     // 8 bytes: timestamp

                // Single allocation instead of concat (faster)
                const frame = Buffer.allocUnsafe(HEADER_SIZE + imageBuffer.length);
                headerBuffer.copy(frame, 0);
                imageBuffer.copy(frame, HEADER_SIZE);

                // Send binary frame (non-blocking)
                const sent = sendBinary(targetWS, frame);
                const sendTime = Date.now() - sendStart;

                // Calculate total latency: from CDP frame received to sent to client
                const totalLatency = Date.now() - frameStartTime;

                // Update latency stats
                latencyStats.total += totalLatency;
                latencyStats.count++;
                latencyStats.min = Math.min(latencyStats.min, totalLatency);
                latencyStats.max = Math.max(latencyStats.max, totalLatency);

                if (sent) {
                  // Frame sent successfully
                  // Adjust timeout based on video mode: faster for video to keep up
                  const timeout = isVideoMode ? 8 : 16; // 8ms for video (125 FPS max), 16ms for static (60 FPS max)
                  setTimeout(() => {
                    clientQueue.pendingFrames = Math.max(0, clientQueue.pendingFrames - 1);
                  }, timeout);
                } else {
                  // Socket is busy, decrement immediately
                  clientQueue.pendingFrames = Math.max(0, clientQueue.pendingFrames - 1);
                }
              } catch (error) {
                // Error sending, decrement
                clientQueue.pendingFrames = Math.max(0, clientQueue.pendingFrames - 1);
              }
            });

            // Sends are fire-and-forget (no promises needed for WebSocket)

            // Log performance stats every 60 frames
            if (frameCount % 60 === 0) {
              const elapsed = (Date.now() - startTime) / 1000;
              const fps = Math.round((frameCount / elapsed) * 10) / 10;
              const sizeKB = Math.round(imageBuffer.length / 1024);
              const activeViewers = viewers.size;

              // Calculate average latency
              const avgLatency = latencyStats.count > 0
                ? Math.round(latencyStats.total / latencyStats.count)
                : 0;
              const minLatency = latencyStats.min === Infinity ? 0 : latencyStats.min;
              const maxLatency = latencyStats.max;

              // Calculate CDP frame rate (actual rate CDP is sending)
              const avgCDPInterval = cdpFrameIntervals.length > 0
                ? Math.round(cdpFrameIntervals.reduce((a, b) => a + b, 0) / cdpFrameIntervals.length)
                : 0;
              const cdpFPS = avgCDPInterval > 0 ? Math.round(1000 / avgCDPInterval) : 0;

              const videoModeStr = isVideoMode ? ' [VIDEO]' : '';
              console.log(
                `Tab ${tabId}: ${frameCount} frames (${fps} FPS), ${skippedFrames} dropped, ${duplicateFrames} duplicates, ` +
                `~${sizeKB}KB/frame, ${activeViewers} viewers${videoModeStr} | ` +
                `Latency: avg=${avgLatency}ms, min=${minLatency}ms, max=${maxLatency}ms | ` +
                `CDP: ${cdpFPS} FPS (${avgCDPInterval}ms interval)`
              );

              // Reset counters
              duplicateFrames = 0;
              latencyStats = { total: 0, min: Infinity, max: 0, count: 0 };
              cdpFrameIntervals = [];
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
  // We need to be careful here - only cleanup if ALL sockets for a client are gone
  // For now, let's rely on the heartbeat/disconnect handler to manage this more broadly
  // or implement a ref counting mechanism. 

  // Minimal implementation:
  // If we passed a clientId, remove it. If socketId, ignore (handled by grouping logic)
  clientFrameQueues.delete(socketId);
}
