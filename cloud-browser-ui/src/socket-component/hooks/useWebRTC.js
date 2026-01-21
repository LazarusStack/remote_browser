import { useRef } from 'react';

export const useWebRTC = () => {
  const peerConnectionsRef = useRef({}); // tabId -> RTCPeerConnection
  const dataChannelsRef = useRef({}); // tabId -> DataChannel

  const setupWebRTCForTab = (tabId, socketRef, setScreenshot, setIsLoading, setActiveTab, latestScreenshotRef, screenshotFrameRef) => {
    if (peerConnectionsRef.current[tabId]) {
      return; // Already set up
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

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
          socketRef.current.emit('webrtc_ice_candidate', {
            tabId,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`WebRTC connection state for tab ${tabId}:`, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          cleanupWebRTCForTab(tabId);
        }
      };

      peerConnectionsRef.current[tabId] = pc;
    } catch (error) {
      console.error("Error setting up WebRTC:", error);
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

  const handleWebRTCOffer = async (tabId, offer, socketRef) => {
    try {
      let pc = peerConnectionsRef.current[tabId];
      if (!pc) {
        // Setup will be called separately, but we need the PC here
        return;
      }

      if (pc && offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socketRef.current.emit("webrtc_answer", {
          tabId,
          answer: pc.localDescription
        });
      }
    } catch (error) {
      console.error("Error handling WebRTC offer:", error);
    }
  };

  const handleWebRTCIceCandidate = async (tabId, candidate) => {
    try {
      const pc = peerConnectionsRef.current[tabId];
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
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
