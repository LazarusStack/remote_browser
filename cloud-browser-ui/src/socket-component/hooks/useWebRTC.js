import { useRef } from 'react';

export const useWebRTC = () => {
  const peerConnectionsRef = useRef({}); // tabId -> RTCPeerConnection
  const dataChannelsRef = useRef({}); // tabId -> DataChannel
  const chunkBuffersRef = useRef({}); // tabId -> Array of chunks

  const setupWebRTCForTab = (tabId, socketRef, setScreenshot, setIsLoading, setActiveTab, latestScreenshotRef, screenshotFrameRef, activeTabRef) => {
    let pc = peerConnectionsRef.current[tabId];
    
    // If PC doesn't exist, create it
    if (!pc) {
      try {
        // Use STUN and TURN servers for better connectivity
        // TURN server is needed when direct connection fails (NAT/firewall issues)
        const turnUrl = import.meta.env.VITE_TURN_URL || 'turn:13.232.240.127:3478';
        const turnUsername = import.meta.env.VITE_TURN_USERNAME || 'turnuser';
        const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL || 'turnpassword';
        
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
              urls: turnUrl,
              username: turnUsername,
              credential: turnCredential
            }
          ]
        });
        peerConnectionsRef.current[tabId] = pc;
      } catch (error) {
        console.error("Error creating WebRTC peer connection:", error);
        return;
      }
    }

    // Always set up handlers (in case PC was created earlier by handleWebRTCOffer)
    // Check if handlers are already set up by checking if ondatachannel is our handler
    if (pc.ondatachannel && pc.ondatachannel._isSetup) {
      return; // Handlers already set up
    }

    try {
      // Handle incoming data channel (server creates it)
      pc.ondatachannel = (event) => {
        const dataChannel = event.channel;
        dataChannel.binaryType = 'arraybuffer';

        dataChannel.onopen = () => {
          console.log(`[WebRTC Client] ✅ DataChannel opened for tab ${tabId}`);
          dataChannelsRef.current[tabId] = dataChannel;
        };

        dataChannel.onmessage = (event) => {
          try {
            // Receive binary screenshot data
            if (event.data instanceof ArrayBuffer) {
              const dataSize = event.data.byteLength;
              const dataView = new Uint8Array(event.data);
              
              // Check if this is a chunked message (has header)
              if (dataSize > 5 && dataView[0] <= 1) {
                // This is a chunked message
                const isFirstChunk = dataView[0] === 1;
                const isLastChunk = dataView[1] === 1;
                const totalChunks = dataView[2] | (dataView[3] << 8);
                const chunkIndex = dataView[4];
                
                // Extract the actual chunk data (skip 5-byte header)
                const chunkData = dataView.slice(5);
                
                if (!chunkBuffersRef.current[tabId]) {
                  chunkBuffersRef.current[tabId] = new Array(totalChunks);
                }
                
                chunkBuffersRef.current[tabId][chunkIndex] = chunkData;
                
                // Check if we have all chunks
                const receivedChunks = chunkBuffersRef.current[tabId].filter(c => c !== undefined).length;
                
                if (isLastChunk && receivedChunks === totalChunks) {
                  // Reassemble the image
                  const totalSize = chunkBuffersRef.current[tabId].reduce((sum, chunk) => sum + chunk.length, 0);
                  const reassembled = new Uint8Array(totalSize);
                  let offset = 0;
                  
                  for (let i = 0; i < totalChunks; i++) {
                    reassembled.set(chunkBuffersRef.current[tabId][i], offset);
                    offset += chunkBuffersRef.current[tabId][i].length;
                  }
                  
                  // Clear chunks
                  delete chunkBuffersRef.current[tabId];
                  
                  console.log(`[WebRTC Client] Received and reassembled ${totalSize} bytes (${totalChunks} chunks) for tab ${tabId}`);
                  
                  // Process the complete image
                  processScreenshot(reassembled.buffer, tabId);
                } else if (isFirstChunk) {
                  console.log(`[WebRTC Client] Started receiving chunked frame (${totalChunks} chunks) for tab ${tabId}`);
                }
              } else {
                // Single message (not chunked)
                console.log(`[WebRTC Client] Received ${dataSize} bytes for tab ${tabId}`);
                processScreenshot(event.data, tabId);
              }
            } else {
              console.warn(`[WebRTC Client] Received non-ArrayBuffer data for tab ${tabId}:`, typeof event.data);
            }
          } catch (error) {
            console.error(`[WebRTC Client] Error processing data channel message for tab ${tabId}:`, error);
          }
        };
        
        // Helper function to process screenshot
        const processScreenshot = (imageBuffer, tabId) => {
          try {
            // Use Blob URL for better performance (avoids base64 conversion overhead)
            const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
            const dataUrl = URL.createObjectURL(blob);

            // Check if this is the active tab
            const currentActiveTab = activeTabRef?.current;
            
            if (tabId === currentActiveTab) {
              // Clean up old blob URL to prevent memory leaks
              if (latestScreenshotRef.current?.blobUrl) {
                URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
              }

              latestScreenshotRef.current = {
                tabId,
                image: dataUrl,
                blobUrl: dataUrl,
                timestamp: Date.now()
              };

              if (screenshotFrameRef.current) {
                cancelAnimationFrame(screenshotFrameRef.current);
              }

              // Use requestAnimationFrame for smooth rendering, but don't queue multiple frames
              if (screenshotFrameRef.current) {
                cancelAnimationFrame(screenshotFrameRef.current);
              }
              
              screenshotFrameRef.current = requestAnimationFrame(() => {
                if (latestScreenshotRef.current && latestScreenshotRef.current.tabId === tabId) {
                  setScreenshot(latestScreenshotRef.current.image);
                  setIsLoading(false);
                  screenshotFrameRef.current = null;
                }
              });
            } else {
              // If not active tab, revoke immediately to save memory
              URL.revokeObjectURL(dataUrl);
            }
          } catch (error) {
            console.error(`[WebRTC Client] Error processing screenshot for tab ${tabId}:`, error);
          }
        };

        dataChannel.onerror = (error) => {
          console.error(`WebRTC DataChannel error for tab ${tabId}:`, error);
        };

        dataChannel.onclose = () => {
          console.log(`WebRTC DataChannel closed for tab ${tabId}`);
          delete dataChannelsRef.current[tabId];
        };
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidate = event.candidate;
          console.log(`[WebRTC Client] ICE candidate generated for tab ${tabId}:`, {
            candidate: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid
          });
          
          if (socketRef.current && typeof socketRef.current.emit === 'function') {
            try {
              socketRef.current.emit('webrtc_ice_candidate', {
                tabId,
                candidate: candidate
              });
              console.log(`[WebRTC Client] ICE candidate sent to server for tab ${tabId}`);
            } catch (error) {
              console.error(`[WebRTC Client] Error sending ICE candidate for tab ${tabId}:`, error);
            }
          } else {
            console.warn(`[WebRTC Client] Cannot send ICE candidate - socket not available for tab ${tabId}`);
          }
        } else {
          console.log(`[WebRTC Client] ICE candidate gathering complete for tab ${tabId}`);
        }
      };

      // Track ICE connection state
      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        console.log(`[WebRTC Client] ICE connection state changed for tab ${tabId}: ${iceState} (PC state: ${pc.connectionState})`);
        
        if (iceState === 'failed') {
          console.error(`[WebRTC Client] ICE connection failed for tab ${tabId} - possible causes:`, {
            networkIssue: 'Firewall/NAT blocking UDP',
            stunIssue: 'STUN server unreachable',
            noCandidates: 'No ICE candidates exchanged'
          });
        } else if (iceState === 'disconnected') {
          console.warn(`[WebRTC Client] ICE connection disconnected for tab ${tabId}`);
        } else if (iceState === 'connected' || iceState === 'completed') {
          console.log(`[WebRTC Client] ✅ ICE connection ${iceState} for tab ${tabId}`);
        }
      };

      // Track ICE gathering state
      pc.onicegatheringstatechange = () => {
        console.log(`[WebRTC Client] ICE gathering state for tab ${tabId}: ${pc.iceGatheringState}`);
      };

      pc.onconnectionstatechange = () => {
        const connState = pc.connectionState;
        const iceState = pc.iceConnectionState;
        const gatheringState = pc.iceGatheringState;
        
        console.log(`[WebRTC Client] Connection state changed for tab ${tabId}:`, {
          connectionState: connState,
          iceConnectionState: iceState,
          iceGatheringState: gatheringState
        });
        
        if (connState === 'failed' || connState === 'closed') {
          console.error(`[WebRTC Client] Connection ${connState} for tab ${tabId} - cleaning up`);
          console.error(`[WebRTC Client] Final states before cleanup:`, {
            connectionState: connState,
            iceConnectionState: iceState,
            iceGatheringState: gatheringState
          });
          cleanupWebRTCForTab(tabId);
        } else if (connState === 'connected') {
          console.log(`[WebRTC Client] ✅ Connection established successfully for tab ${tabId}`);
        }
      };

      // Mark handlers as set up
      pc.ondatachannel._isSetup = true;
    } catch (error) {
      console.error("[WebRTC Client] Error setting up WebRTC:", error);
    }
  };

  const cleanupWebRTCForTab = (tabId) => {
    if (peerConnectionsRef.current[tabId]) {
      peerConnectionsRef.current[tabId].close();
      delete peerConnectionsRef.current[tabId];
    }
    delete dataChannelsRef.current[tabId];
  };

  const cleanupAllWebRTC = () => {
    Object.keys(peerConnectionsRef.current).forEach(tabId => {
      cleanupWebRTCForTab(tabId);
    });
  };

  const handleWebRTCOffer = async (tabId, offer, socketOrRef) => {
    try {
      // Handle both socket object and socketRef
      let socket = socketOrRef?.current || socketOrRef;
      
      // If socket is a ref but current is null, try to get it from peerConnectionsRef
      // This is a fallback for when socket isn't ready yet
      if (!socket || typeof socket.emit !== 'function') {
        // Try to get socket from socketRef if available
        if (socketOrRef && typeof socketOrRef === 'object' && 'current' in socketOrRef) {
          socket = socketOrRef.current;
        }
      }
      
      if (!socket || typeof socket.emit !== 'function') {
        console.error(`[WebRTC Client] Invalid socket for tab ${tabId}`, {
          socketType: typeof socket,
          hasEmit: socket && typeof socket.emit,
          socketOrRefType: typeof socketOrRef
        });
        return;
      }

      let pc = peerConnectionsRef.current[tabId];
      
      // If PC doesn't exist yet, create it now (race condition fix)
      if (!pc) {
        console.log(`[WebRTC Client] Creating peer connection for tab ${tabId} (offer received before setup)`);
        // Use STUN and TURN servers for better connectivity
        // TURN server is needed when direct connection fails (NAT/firewall issues)
        const turnUrl = import.meta.env.VITE_TURN_URL || 'turn:13.232.240.127:3478';
        const turnUsername = import.meta.env.VITE_TURN_USERNAME || 'turnuser';
        const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL || 'turnpassword';
        
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
              urls: turnUrl,
              username: turnUsername,
              credential: turnCredential
            }
          ]
        });

        // Note: Data channel handlers will be set up by setupWebRTCForTab
        // We just create the PC here to handle the offer

        // Handle ICE candidates - store socket reference for later use
        const candidateSocket = socket;
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const candidate = event.candidate;
            console.log(`[WebRTC Client] ICE candidate generated for tab ${tabId}:`, {
              candidate: candidate.candidate,
              sdpMLineIndex: candidate.sdpMLineIndex,
              sdpMid: candidate.sdpMid
            });
            
            // Use the socket that was passed in
            if (candidateSocket && typeof candidateSocket.emit === 'function') {
              try {
                candidateSocket.emit('webrtc_ice_candidate', {
                  tabId,
                  candidate: candidate
                });
                console.log(`[WebRTC Client] ✅ ICE candidate sent to server for tab ${tabId}`);
              } catch (error) {
                console.error(`[WebRTC Client] ❌ Error sending ICE candidate for tab ${tabId}:`, error);
              }
            } else {
              console.warn(`[WebRTC Client] ⚠️ Cannot send ICE candidate - socket not available for tab ${tabId}`, {
                hasSocket: !!candidateSocket,
                socketType: typeof candidateSocket,
                hasEmit: candidateSocket && typeof candidateSocket.emit
              });
            }
          } else {
            console.log(`[WebRTC Client] ICE candidate gathering complete for tab ${tabId}`);
          }
        };

        // Track ICE connection state
        pc.oniceconnectionstatechange = () => {
          const iceState = pc.iceConnectionState;
          console.log(`[WebRTC Client] ICE connection state changed for tab ${tabId}: ${iceState} (PC state: ${pc.connectionState})`);
          
          if (iceState === 'failed') {
            console.error(`[WebRTC Client] ICE connection failed for tab ${tabId} - possible causes:`, {
              networkIssue: 'Firewall/NAT blocking UDP',
              stunIssue: 'STUN server unreachable',
              noCandidates: 'No ICE candidates exchanged'
            });
          } else if (iceState === 'disconnected') {
            console.warn(`[WebRTC Client] ICE connection disconnected for tab ${tabId}`);
          } else if (iceState === 'connected' || iceState === 'completed') {
            console.log(`[WebRTC Client] ✅ ICE connection ${iceState} for tab ${tabId}`);
          }
        };

        // Track ICE gathering state
        pc.onicegatheringstatechange = () => {
          console.log(`[WebRTC Client] ICE gathering state for tab ${tabId}: ${pc.iceGatheringState}`);
        };

        pc.onconnectionstatechange = () => {
          const connState = pc.connectionState;
          const iceState = pc.iceConnectionState;
          const gatheringState = pc.iceGatheringState;
          
          console.log(`[WebRTC Client] Connection state changed for tab ${tabId}:`, {
            connectionState: connState,
            iceConnectionState: iceState,
            iceGatheringState: gatheringState
          });
          
          if (connState === 'failed' || connState === 'closed') {
            console.error(`[WebRTC Client] Connection ${connState} for tab ${tabId} - cleaning up`);
            console.error(`[WebRTC Client] Final states before cleanup:`, {
              connectionState: connState,
              iceConnectionState: iceState,
              iceGatheringState: gatheringState
            });
            cleanupWebRTCForTab(tabId);
          } else if (connState === 'connected') {
            console.log(`[WebRTC Client] ✅ Connection established successfully for tab ${tabId}`);
          }
        };

        peerConnectionsRef.current[tabId] = pc;
      }

      if (pc && offer) {
        console.log(`[WebRTC Client] Processing offer for tab ${tabId}`);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`[WebRTC Client] Sending answer for tab ${tabId}`);
        socket.emit("webrtc_answer", {
          tabId,
          answer: pc.localDescription
        });
      }
    } catch (error) {
      console.error(`[WebRTC Client] Error handling WebRTC offer for tab ${tabId}:`, error);
    }
  };

  const handleWebRTCIceCandidate = async (tabId, candidate) => {
    try {
      const pc = peerConnectionsRef.current[tabId];
      if (!pc) {
        console.warn(`[WebRTC Client] ICE candidate received but no peer connection for tab ${tabId}`);
        return;
      }
      
      if (pc && candidate) {
        console.log(`[WebRTC Client] ICE candidate received from server for tab ${tabId}:`, {
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex,
          sdpMid: candidate.sdpMid
        });
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`[WebRTC Client] ICE candidate added successfully for tab ${tabId} (ICE state: ${pc.iceConnectionState})`);
      }
    } catch (error) {
      console.error(`[WebRTC Client] Error adding ICE candidate for tab ${tabId}:`, error.message);
      console.error(`[WebRTC Client] Candidate that failed:`, candidate);
    }
  };

  return {
    setupWebRTCForTab,
    cleanupWebRTCForTab,
    cleanupAllWebRTC,
    handleWebRTCOffer,
    handleWebRTCIceCandidate,
    peerConnectionsRef
  };
};
