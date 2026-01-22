// CDP Screencast management

import { config } from '../config/index.js';

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

      // Listen for screencast frames with throttling
      let lastFrameTime = 0;
      let frameCount = 0;
      let skippedFrames = 0;
      let startTime = Date.now();
      const minFrameInterval = config.screencast.minFrameInterval;
      
      cdpSession.on('Page.screencastFrame', async (event) => {
        if (!browserInstance.screencastActive[tabId] || !browserInstance.pages[tabId] || browserInstance.pages[tabId].isClosed()) {
          return;
        }

        // Throttle frames to prevent overwhelming the network
        const now = Date.now();
        if (now - lastFrameTime < minFrameInterval) {
          skippedFrames++;
          // Acknowledge but skip processing this frame
          try {
            await cdpSession.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
          } catch {}
          return;
        }
        lastFrameTime = now;
        frameCount++;

        try {
          const { data, sessionId } = event;
          
          // Broadcast frame to ALL clients viewing this tab
          // Convert base64 to Buffer for efficient binary transfer via Socket.IO
          const imageBuffer = Buffer.from(data, 'base64');
          const viewers = browserInstance.tabViewers[tabId] || new Set();
          viewers.forEach(socketId => {
            const viewerSocket = io.sockets.sockets.get(socketId);
            if (viewerSocket) {
              // Send binary data through Socket.IO (faster than base64)
              viewerSocket.emit("screenshot_binary", {
                tabId,
                image: imageBuffer
              });
            }
          });
          
          // Log performance stats every 60 frames (~3 seconds at 20 FPS)
          if (frameCount % 60 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const fps = Math.round((frameCount / elapsed) * 10) / 10;
            const imageSizeKB = Math.round(imageBuffer.length / 1024);
            console.log(`Tab ${tabId}: ${frameCount} frames sent (${fps} FPS), ${skippedFrames} skipped, ~${imageSizeKB}KB/frame`);
          }

          // Notify CDP that we've processed the frame
          await cdpSession.send('Page.screencastFrameAck', { sessionId }).catch(() => {
            // Ignore errors if session is closed
          });
        } catch (error) {
          // Silently handle errors - page might be closing
          if (!error.message.includes('closed') && !error.message.includes('Target closed')) {
            console.error("Error processing screencast frame:", error.message);
          }
        }
      });

      // Handle CDP session errors
      cdpSession.on('error', (error) => {
        console.error("CDP session error:", error.message);
        delete browserInstance.cdpSessions[tabId];
        browserInstance.screencastActive[tabId] = false;
      });
    }

    // Start screencast with settings
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
