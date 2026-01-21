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
      // Use STUN and TURN servers for better connectivity
      // TURN server is needed when direct connection fails (NAT/firewall issues)
      const turnUrl = process.env.TURN_URL || 'turn:free.expressturn.com:3478';
      const turnUsername = process.env.TURN_USERNAME || '000000002084391365';
      const turnCredential = process.env.TURN_CREDENTIAL || '3tXAhpxpPfiRAQKaeTPPyNl2j3c=';
      
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
      
      console.log(`[WebRTC] TURN server configured: ${turnUrl}`);

      // Create data channel for screenshot data with optimized settings
      const dataChannel = pc.createDataChannel('screenshots', {
        ordered: false, // UDP-like behavior for lower latency
        maxRetransmits: 0, // Don't retransmit, drop old frames (prioritize latest)
        maxPacketLifeTime: 100 // Drop frames older than 100ms
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

      // Track candidate types for diagnostics
      let candidateCount = 0;
      const candidateTypes = { host: 0, srflx: 0, relay: 0, prflx: 0 };
      
      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidateCount++;
          const candidate = event.candidate;
          const candidateStr = candidate.candidate || '';
          
          // Track candidate types
          if (candidateStr.includes(' typ host ')) candidateTypes.host++;
          else if (candidateStr.includes(' typ srflx ')) candidateTypes.srflx++;
          else if (candidateStr.includes(' typ relay ')) candidateTypes.relay++;
          else if (candidateStr.includes(' typ prflx ')) candidateTypes.prflx++;
          
          console.log(`[WebRTC] ICE candidate #${candidateCount} generated for tab ${tabId}, socket ${socket.id}:`, {
            candidate: candidateStr.substring(0, 100),
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid,
            hasRelay: candidateTypes.relay > 0
          });
          socket.emit('webrtc_ice_candidate', {
            tabId,
            candidate: candidate
          });
        } else {
          console.log(`[WebRTC] ICE candidate gathering complete for tab ${tabId}, socket ${socket.id}. Total: ${candidateCount}`, {
            types: candidateTypes,
            hasTURN: candidateTypes.relay > 0
          });
        }
      };

      // Track ICE connection state
      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        console.log(`[WebRTC] ICE connection state changed for tab ${tabId}, socket ${socket.id}: ${iceState} (PC state: ${pc.connectionState})`);
        
        if (iceState === 'failed') {
          console.error(`[WebRTC] ❌ ICE connection failed for tab ${tabId}, socket ${socket.id} - possible causes:`, {
            networkIssue: 'Firewall/NAT blocking UDP',
            stunIssue: 'STUN server unreachable',
            noCandidates: 'No ICE candidates exchanged',
            noRelayCandidates: candidateTypes.relay === 0 ? 'No TURN relay candidates - check TURN server configuration' : 'TURN server working',
            candidateTypes: candidateTypes
          });
        } else if (iceState === 'disconnected') {
          console.warn(`[WebRTC] ICE connection disconnected for tab ${tabId}, socket ${socket.id}`);
        } else if (iceState === 'connected' || iceState === 'completed') {
          console.log(`[WebRTC] ICE connection ${iceState} for tab ${tabId}, socket ${socket.id}`);
        }
      };

      // Track ICE gathering state
      pc.onicegatheringstatechange = () => {
        console.log(`[WebRTC] ICE gathering state for tab ${tabId}, socket ${socket.id}: ${pc.iceGatheringState}`);
      };

      pc.onconnectionstatechange = () => {
        const connState = pc.connectionState;
        const iceState = pc.iceConnectionState;
        const gatheringState = pc.iceGatheringState;
        
        console.log(`[WebRTC] Connection state changed for tab ${tabId}, socket ${socket.id}:`, {
          connectionState: connState,
          iceConnectionState: iceState,
          iceGatheringState: gatheringState,
          dataChannelState: dataChannel.readyState
        });
        
        if (connState === 'failed' || connState === 'closed') {
          console.warn(`[WebRTC] Connection ${connState} for tab ${tabId}, socket ${socket.id} - cleaning up`);
          console.warn(`[WebRTC] Final states before cleanup:`, {
            connectionState: connState,
            iceConnectionState: iceState,
            iceGatheringState: gatheringState
          });
          cleanupWebRTC(socket.id, tabId, browserInstance);
        } else if (connState === 'connected') {
          console.log(`[WebRTC] ✅ Connection established successfully for tab ${tabId}, socket ${socket.id}`);
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
