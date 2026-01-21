import { setupWebRTC } from '../webrtc/webrtcManager.js';

export async function startCDPScreencast(socket, tabId, browserInstance, io) {
  const page = browserInstance.pages[tabId];
  if (!page || page.isClosed()) return;

  // Add this socket to the viewers of this tab
  if (!browserInstance.tabViewers[tabId]) {
    browserInstance.tabViewers[tabId] = new Set();
  }
  browserInstance.tabViewers[tabId].add(socket.id);

  // Setup WebRTC for this client/tab
  await setupWebRTC(socket, tabId, browserInstance);

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

      // Listen for screencast frames
      cdpSession.on('Page.screencastFrame', async (event) => {
        if (!browserInstance.screencastActive[tabId] || !browserInstance.pages[tabId] || browserInstance.pages[tabId].isClosed()) {
          return;
        }

        try {
          const { data, sessionId } = event;

          // Broadcast frame to ALL clients viewing this tab
          // Convert base64 to Buffer for efficient binary transfer
          const imageBuffer = Buffer.from(data, 'base64');
          const viewers = browserInstance.tabViewers[tabId] || new Set();

          viewers.forEach(socketId => {
            // Try WebRTC DataChannel first (most efficient)
            const dataChannel = browserInstance.webrtcDataChannels[socketId]?.[tabId];
            if (dataChannel && dataChannel.readyState === 'open') {
              try {
                // Send binary data through WebRTC DataChannel
                dataChannel.send(imageBuffer);
              } catch (error) {
                // Fallback to Socket.IO if WebRTC fails
                const viewerSocket = io.sockets.sockets.get(socketId);
                if (viewerSocket) {
                  viewerSocket.emit("screenshot_binary", {
                    tabId,
                    image: imageBuffer
                  });
                }
              }
            } else {
              // Fallback to Socket.IO binary
              const viewerSocket = io.sockets.sockets.get(socketId);
              if (viewerSocket) {
                viewerSocket.emit("screenshot_binary", {
                  tabId,
                  image: imageBuffer
                });
                // Also send base64 for compatibility
                // viewerSocket.emit("screenshot", {
                //   tabId,
                //   image: data
                // });
              }
            }
          });

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

    // Start screencast with optimized settings
    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 80, // Slightly reduced from 85 for bandwidth savings
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 1 // Send every frame for smooth experience (WebRTC handles flow control)
    });

    browserInstance.screencastActive[tabId] = true;
  } catch (error) {
    console.error("Error starting CDP screencast:", error.message);
    browserInstance.screencastActive[tabId] = false;
  }
}

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
