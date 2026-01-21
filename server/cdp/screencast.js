import { setupWebRTC } from '../webrtc/webrtcManager.js';

export async function startCDPScreencast(socket, tabId, browserInstance) {
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

      // Track last logged state per socket to avoid spam
      const lastLoggedState = {};

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
            // Send binary data through WebRTC DataChannel
            const dataChannel = browserInstance.webrtcDataChannels[socketId]?.[tabId];
            const pc = browserInstance.webrtcConnections[socketId]?.[tabId];
            
            if (!dataChannel) {
              // Data channel not set up yet for this viewer (log only once)
              const key = `${socketId}_${tabId}_no_channel`;
              if (!lastLoggedState[key]) {
                console.warn(`[Screencast] Data channel not found for socket ${socketId}, tab ${tabId}`);
                lastLoggedState[key] = true;
              }
              return;
            }

            // Check if data channel is open before sending
            if (dataChannel.readyState !== 'open') {
              // Log state changes only (avoid spam)
              const stateKey = `${socketId}_${tabId}_${dataChannel.readyState}_${pc?.connectionState || 'unknown'}`;
              if (lastLoggedState[stateKey] !== true) {
                if (dataChannel.readyState === 'connecting') {
                  console.log(`[Screencast] Data channel connecting for socket ${socketId}, tab ${tabId} (PC state: ${pc?.connectionState || 'unknown'})`);
                } else if (dataChannel.readyState === 'closing' || dataChannel.readyState === 'closed') {
                  console.warn(`[Screencast] Data channel ${dataChannel.readyState} for socket ${socketId}, tab ${tabId} (PC state: ${pc?.connectionState || 'unknown'})`);
                }
                lastLoggedState[stateKey] = true;
              }
              return;
            }
            
            // Channel is open - clear any previous warning states
            const openKey = `${socketId}_${tabId}_open`;
            if (!lastLoggedState[openKey]) {
              console.log(`[Screencast] Data channel open for socket ${socketId}, tab ${tabId} - sending frames`);
              lastLoggedState[openKey] = true;
            }

            try {
              dataChannel.send(imageBuffer);
            } catch (error) {
              console.error(`Error sending screenshot binary through WebRTC DataChannel for socket ${socketId}, tab ${tabId}:`, error.message);
              // WebRTC DataChannel error - skip this viewer
              // Viewer will need to reconnect to receive frames
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
