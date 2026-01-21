import { useRef } from 'react';

export const useWebRTC = () => {
  const peerConnectionsRef = useRef({}); // tabId -> RTCPeerConnection
  const dataChannelsRef = useRef({}); // tabId -> DataChannel

  const setupWebRTCForTab = (tabId, socketRef, setScreenshot, setIsLoading, setActiveTab, latestScreenshotRef, screenshotFrameRef) => {
    let pc = peerConnectionsRef.current[tabId];
    
    // If PC doesn't exist, create it
    if (!pc) {
      try {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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
          console.log(`WebRTC DataChannel opened for tab ${tabId}`);
          dataChannelsRef.current[tabId] = dataChannel;
        };

        dataChannel.onmessage = (event) => {
          // Receive binary screenshot data
          if (event.data instanceof ArrayBuffer) {
            // Use Blob URL for better performance (avoids base64 conversion overhead)
            const blob = new Blob([event.data], { type: 'image/jpeg' });
            const dataUrl = URL.createObjectURL(blob);

            setActiveTab((currentActiveTab) => {
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
              return currentActiveTab;
            });
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
        if (event.candidate && socketRef.current) {
          const candidate = event.candidate;
          console.log(`[WebRTC Client] ICE candidate generated for tab ${tabId}:`, {
            candidate: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid
          });
          socketRef.current.emit('webrtc_ice_candidate', {
            tabId,
            candidate: candidate
          });
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
      const socket = socketOrRef?.current || socketOrRef;
      
      if (!socket || typeof socket.emit !== 'function') {
        console.error(`[WebRTC Client] Invalid socket for tab ${tabId}`);
        return;
      }

      let pc = peerConnectionsRef.current[tabId];
      
      // If PC doesn't exist yet, create it now (race condition fix)
      if (!pc) {
        console.log(`[WebRTC Client] Creating peer connection for tab ${tabId} (offer received before setup)`);
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Note: Data channel handlers will be set up by setupWebRTCForTab
        // We just create the PC here to handle the offer

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate && socket) {
            const candidate = event.candidate;
            console.log(`[WebRTC Client] ICE candidate generated for tab ${tabId}:`, {
              candidate: candidate.candidate,
              sdpMLineIndex: candidate.sdpMLineIndex,
              sdpMid: candidate.sdpMid
            });
            socket.emit('webrtc_ice_candidate', {
              tabId,
              candidate: candidate
            });
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
