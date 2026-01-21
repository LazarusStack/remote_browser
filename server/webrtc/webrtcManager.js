import wrtc from "@koush/wrtc";
const { RTCPeerConnection, RTCSessionDescription } = wrtc;

// Setup WebRTC connection for a client viewing a tab
export async function setupWebRTC(socket, tabId, browserInstance) {
  try {
    if (!browserInstance.webrtcConnections[socket.id]) {
      browserInstance.webrtcConnections[socket.id] = {};
    }
    if (!browserInstance.webrtcDataChannels[socket.id]) {
      browserInstance.webrtcDataChannels[socket.id] = {};
    }

    // Create or reuse peer connection for this tab
    let pc = browserInstance.webrtcConnections[socket.id][tabId];
    if (!pc) {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      // Create data channel for screenshot data
      const dataChannel = pc.createDataChannel('screenshots', {
        ordered: false, // UDP-like behavior
        maxRetransmits: 0 // Don't retransmit, drop old frames
      });

      dataChannel.binaryType = 'arraybuffer';

      dataChannel.onopen = () => {
        console.log(`[WebRTC] DataChannel opened for tab ${tabId}, socket ${socket.id} (PC state: ${pc.connectionState})`);
      };

      dataChannel.onerror = (error) => {
        console.error(`[WebRTC] DataChannel error for tab ${tabId}, socket ${socket.id}:`, error);
      };

      dataChannel.onclose = () => {
        console.log(`[WebRTC] DataChannel closed for tab ${tabId}, socket ${socket.id} (PC state: ${pc.connectionState})`);
        if (browserInstance.webrtcDataChannels[socket.id]) {
          delete browserInstance.webrtcDataChannels[socket.id][tabId];
        }
      };

      // Log initial state
      console.log(`[WebRTC] DataChannel created for tab ${tabId}, socket ${socket.id} (initial state: ${dataChannel.readyState})`);

      browserInstance.webrtcConnections[socket.id][tabId] = pc;
      browserInstance.webrtcDataChannels[socket.id][tabId] = dataChannel;

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc_ice_candidate', {
            tabId,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state changed for tab ${tabId}, socket ${socket.id}: ${pc.connectionState} (DC state: ${dataChannel.readyState})`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          console.warn(`[WebRTC] Connection ${pc.connectionState} for tab ${tabId}, socket ${socket.id} - cleaning up`);
          cleanupWebRTC(socket.id, tabId, browserInstance);
        }
      };

      // Create offer and send to client
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log(`[WebRTC] Offer created and sent for tab ${tabId}, socket ${socket.id} (PC state: ${pc.connectionState}, DC state: ${dataChannel.readyState})`);
      socket.emit('webrtc_offer', {
        tabId,
        offer: pc.localDescription
      });
    }

    return browserInstance.webrtcDataChannels[socket.id][tabId];
  } catch (error) {
    console.error("Error setting up WebRTC:", error);
    return null;
  }
}

export function cleanupWebRTC(socketId, tabId, browserInstance) {
  if (browserInstance.webrtcConnections[socketId] && browserInstance.webrtcConnections[socketId][tabId]) {
    browserInstance.webrtcConnections[socketId][tabId].close();
    delete browserInstance.webrtcConnections[socketId][tabId];
  }
  if (browserInstance.webrtcDataChannels[socketId] && browserInstance.webrtcDataChannels[socketId][tabId]) {
    delete browserInstance.webrtcDataChannels[socketId][tabId];
  }
}
