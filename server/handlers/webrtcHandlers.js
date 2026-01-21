import wrtc from "@koush/wrtc";
const { RTCPeerConnection, RTCSessionDescription } = wrtc;
import { getBrowserInstance } from '../browser/browserManager.js';

// Store test WebRTC connections (socket.id -> { pc, dataChannel })
const testWebRTCConnections = new Map();

export function setupWebRTCHandlers(socket) {
  // WebRTC signaling handlers - client sends answer (handles both test and regular connections)
  socket.on("webrtc_answer", async ({ tabId, answer }) => {
    // If no tabId, this is a test connection
    if (!tabId) {
      const testConn = testWebRTCConnections.get(socket.id);
      if (testConn && testConn.pc && answer) {
        try {
          await testConn.pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log(`[WebRTC Test] Answer received and set for socket ${socket.id}`);
        } catch (error) {
          console.error(`[WebRTC Test] Error handling answer:`, error);
        }
      }
      return;
    }

    // Regular connection handling
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) {
      console.warn(`[WebRTC] Answer received but no browser instance for socket ${socket.id}`);
      return;
    }

    try {
      const pc = browserInstance.webrtcConnections[socket.id]?.[tabId];
      const dataChannel = browserInstance.webrtcDataChannels[socket.id]?.[tabId];
      
      if (!pc) {
        console.warn(`[WebRTC] Answer received but no peer connection for socket ${socket.id}, tab ${tabId}`);
        return;
      }
      
      if (pc && answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`[WebRTC] Answer received and set for tab ${tabId}, socket ${socket.id} (PC state: ${pc.connectionState}, DC state: ${dataChannel?.readyState || 'N/A'})`);
      }
    } catch (error) {
      console.error(`[WebRTC] Error handling answer for socket ${socket.id}, tab ${tabId}:`, error);
    }
  });

  socket.on("webrtc_ice_candidate", async ({ tabId, candidate }) => {
    // Check if this is a test connection (no tabId) or regular connection
    if (!tabId) {
      // Test connection
      const testConn = testWebRTCConnections.get(socket.id);
      if (testConn && testConn.pc && candidate) {
        try {
          await testConn.pc.addIceCandidate(candidate);
          console.log(`[WebRTC Test] ICE candidate added for socket ${socket.id}`);
        } catch (error) {
          console.error(`[WebRTC Test] Error adding ICE candidate:`, error);
        }
      }
      return;
    }

    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) {
      console.warn(`[WebRTC] ICE candidate received but no browser instance for socket ${socket.id}`);
      return;
    }

    try {
      const pc = browserInstance.webrtcConnections[socket.id]?.[tabId];
      if (!pc) {
        console.warn(`[WebRTC] ICE candidate received but no peer connection for socket ${socket.id}, tab ${tabId}`);
        return;
      }
      
      if (pc && candidate) {
        console.log(`[WebRTC] ICE candidate received from client for tab ${tabId}, socket ${socket.id}:`, {
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex,
          sdpMid: candidate.sdpMid
        });
        await pc.addIceCandidate(candidate);
        console.log(`[WebRTC] ICE candidate added successfully for tab ${tabId}, socket ${socket.id} (ICE state: ${pc.iceConnectionState})`);
      }
    } catch (error) {
      console.error(`[WebRTC] Error adding ICE candidate for socket ${socket.id}, tab ${tabId}:`, error.message);
      console.error(`[WebRTC] Candidate that failed:`, candidate);
    }
  });

  // Test WebRTC handler - simplified version for testing
  socket.on("webrtc_test_start", async () => {
    try {
      console.log(`[WebRTC Test] Starting test connection for socket ${socket.id}`);
      
      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      // Create data channel
      const dataChannel = pc.createDataChannel('test', {
        ordered: false,
        maxRetransmits: 0
      });

      dataChannel.binaryType = 'arraybuffer';

      dataChannel.onopen = () => {
        console.log(`[WebRTC Test] Data channel opened for socket ${socket.id}`);
        
        // Start sending test data periodically
        let messageCount = 0;
        const sendInterval = setInterval(() => {
          if (dataChannel.readyState === 'open') {
            const message = `Test message #${++messageCount} - ${new Date().toISOString()}`;
            try {
              dataChannel.send(message);
              console.log(`[WebRTC Test] Sent test message #${messageCount}`);
            } catch (error) {
              console.error(`[WebRTC Test] Error sending message:`, error);
              clearInterval(sendInterval);
            }
          } else {
            clearInterval(sendInterval);
          }
        }, 2000); // Send every 2 seconds

        // Also send binary data periodically
        let binaryCount = 0;
        const binaryInterval = setInterval(() => {
          if (dataChannel.readyState === 'open') {
            try {
              // Create 512 bytes of test data
              const buffer = new ArrayBuffer(512);
              const view = new Uint8Array(buffer);
              for (let i = 0; i < view.length; i++) {
                view[i] = (binaryCount + i) % 256;
              }
              dataChannel.send(buffer);
              console.log(`[WebRTC Test] Sent binary data #${++binaryCount}`);
            } catch (error) {
              console.error(`[WebRTC Test] Error sending binary:`, error);
              clearInterval(binaryInterval);
            }
          } else {
            clearInterval(binaryInterval);
          }
        }, 3000); // Send every 3 seconds

        // Clean up intervals on close
        dataChannel.onclose = () => {
          clearInterval(sendInterval);
          clearInterval(binaryInterval);
        };
      };

      dataChannel.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          console.log(`[WebRTC Test] Received ${event.data.byteLength} bytes (binary) from client`);
        } else {
          console.log(`[WebRTC Test] Received message from client: ${event.data}`);
        }
      };

      dataChannel.onerror = (error) => {
        console.error(`[WebRTC Test] Data channel error:`, error);
      };

      dataChannel.onclose = () => {
        console.log(`[WebRTC Test] Data channel closed for socket ${socket.id}`);
      };

      // ICE candidate handler
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc_ice_candidate', {
            candidate: event.candidate
          });
        }
      };

      // Connection state handlers
      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC Test] ICE connection state: ${pc.iceConnectionState} for socket ${socket.id}`);
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC Test] Connection state: ${pc.connectionState} for socket ${socket.id}`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          testWebRTCConnections.delete(socket.id);
        }
      };

      // Store connection
      testWebRTCConnections.set(socket.id, { pc, dataChannel });

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_offer', {
        offer: pc.localDescription
      });
      console.log(`[WebRTC Test] Offer sent to socket ${socket.id}`);
    } catch (error) {
      console.error(`[WebRTC Test] Error setting up test connection:`, error);
    }
  });


  // Cleanup on disconnect
  socket.on('disconnect', () => {
    const testConn = testWebRTCConnections.get(socket.id);
    if (testConn) {
      if (testConn.pc) {
        testConn.pc.close();
      }
      testWebRTCConnections.delete(socket.id);
      console.log(`[WebRTC Test] Cleaned up test connection for socket ${socket.id}`);
    }
  });
}
