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
              console.log(`[Screencast] ✅ Data channel open for socket ${socketId}, tab ${tabId} - sending frames`);
              lastLoggedState[openKey] = true;
            }

            try {
              // WebRTC DataChannel has a maximum message size of ~64KB
              // If the image is larger, we need to chunk it
              const MAX_CHUNK_SIZE = 60 * 1024; // 60KB to be safe
              
              if (imageBuffer.length <= MAX_CHUNK_SIZE) {
                // Small enough to send in one message
                dataChannel.send(imageBuffer);
              } else {
                // Need to chunk the data
                const totalChunks = Math.ceil(imageBuffer.length / MAX_CHUNK_SIZE);
                const bufferView = new Uint8Array(imageBuffer);
                
                for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                  const start = chunkIndex * MAX_CHUNK_SIZE;
                  const end = Math.min(start + MAX_CHUNK_SIZE, imageBuffer.length);
                  const chunk = bufferView.slice(start, end);
                  
                  // Send chunk with metadata (first byte indicates chunk info)
                  const chunkHeader = new Uint8Array(5);
                  chunkHeader[0] = chunkIndex === 0 ? 1 : 0; // 1 = first chunk, 0 = continuation
                  chunkHeader[1] = chunkIndex === totalChunks - 1 ? 1 : 0; // 1 = last chunk, 0 = more coming
                  chunkHeader[2] = totalChunks & 0xFF; // Total chunks (low byte)
                  chunkHeader[3] = (totalChunks >> 8) & 0xFF; // Total chunks (high byte)
                  chunkHeader[4] = chunkIndex & 0xFF; // Chunk index
                  
                  const chunkWithHeader = new Uint8Array(chunkHeader.length + chunk.length);
                  chunkWithHeader.set(chunkHeader);
                  chunkWithHeader.set(chunk, chunkHeader.length);
                  
                  dataChannel.send(chunkWithHeader.buffer);
                }
              }
              
              // Log first few frames to confirm sending
              const frameKey = `${socketId}_${tabId}_frame_count`;
              if (!lastLoggedState[frameKey]) {
                lastLoggedState[frameKey] = 0;
              }
              lastLoggedState[frameKey]++;
              if (lastLoggedState[frameKey] <= 3) {
                const chunks = imageBuffer.length > MAX_CHUNK_SIZE ? Math.ceil(imageBuffer.length / MAX_CHUNK_SIZE) : 1;
                console.log(`[Screencast] Sent frame #${lastLoggedState[frameKey]} (${imageBuffer.length} bytes${chunks > 1 ? `, ${chunks} chunks` : ''}) to socket ${socketId}, tab ${tabId}`);
              }
            } catch (error) {
              console.error(`[Screencast] ❌ Error sending screenshot binary through WebRTC DataChannel for socket ${socketId}, tab ${tabId}:`, error.message);
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
