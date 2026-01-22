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
      // Optimize for STUN-first (low latency), TURN as fallback only
      // STUN servers are listed first and multiple are used for reliability
      // TURN is added last as a fallback for strict NAT/firewall scenarios
      const iceServers = [
        // Primary STUN servers (Google's public STUN servers - most reliable)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Additional reliable STUN servers
        { urls: 'stun:stun.stunprotocol.org:3478' },
        { urls: 'stun:stun.voiparound.com' },
        { urls: 'stun:stun.voipbuster.com' },
        { urls: 'stun:stun.voipstunt.com' },
        { urls: 'stun:stun.voxgratia.org' },
      ];
      
      // Add TURN server as fallback (slower, but works with strict NAT)
      // Only used if direct connection fails - explicitly marked as fallback
      const turnUrl = process.env.TURN_URL || 'turn:13.126.43.172:3478';
      const turnUsername = process.env.TURN_USERNAME || 'turnuser';
      const turnCredential = process.env.TURN_CREDENTIAL || 'turnpassword';
      
      // Only add TURN if explicitly configured (don't force relay usage)
      if (turnUrl && turnUrl !== '') {
        iceServers.push({
          urls: turnUrl,
          username: turnUsername,
          credential: turnCredential
        });
      }
      
      pc = new RTCPeerConnection({
        iceServers: iceServers,
        iceCandidatePoolSize: 0, // Don't pre-gather (faster initial connection)
        // Use 'all' to gather all candidates, but WebRTC will prefer lower latency ones
        // (host > srflx > relay). This ensures STUN works first, TURN only as fallback.
        iceTransportPolicy: 'all'
      });
      
      const stunCount = iceServers.filter(s => s.urls.includes('stun:')).length;
      const turnCount = iceServers.filter(s => s.urls.includes('turn:')).length;
      console.log(`[WebRTC] Configured with ${stunCount} STUN servers${turnCount > 0 ? ` + ${turnCount} TURN fallback` : ' (TURN disabled)'}`);

      // Create data channel for screenshot data with optimized settings
      const dataChannel = pc.createDataChannel('screenshots', {
        ordered: false, // UDP-like behavior for lower latency
        maxPacketLifeTime: 100 // Drop frames older than 100ms (prioritize latest frames)
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
          let candidateType = 'unknown';
          if (candidateStr.includes(' typ host ')) {
            candidateTypes.host++;
            candidateType = 'host (direct - fastest)';
          } else if (candidateStr.includes(' typ srflx ')) {
            candidateTypes.srflx++;
            candidateType = 'srflx (STUN - fast)';
          } else if (candidateStr.includes(' typ relay ')) {
            candidateTypes.relay++;
            candidateType = 'relay (TURN - slower)';
          } else if (candidateStr.includes(' typ prflx ')) {
            candidateTypes.prflx++;
            candidateType = 'prflx (peer reflexive)';
          }
          
          // Log first few candidates in detail, then summarize
          if (candidateCount <= 5) {
            console.log(`[WebRTC] ICE candidate #${candidateCount} (${candidateType}) for tab ${tabId}, socket ${socket.id}:`, {
              candidate: candidateStr.substring(0, 150),
              sdpMLineIndex: candidate.sdpMLineIndex,
              sdpMid: candidate.sdpMid
            });
          }
          socket.emit('webrtc_ice_candidate', {
            tabId,
            candidate: candidate
          });
        } else {
          const preferredType = candidateTypes.host > 0 ? 'host (direct)' : 
                                candidateTypes.srflx > 0 ? 'srflx (STUN)' : 
                                candidateTypes.relay > 0 ? 'relay (TURN - slower!)' : 'none';
          console.log(`[WebRTC] ✅ ICE candidate gathering complete for tab ${tabId}, socket ${socket.id}. Total: ${candidateCount}`, {
            types: candidateTypes,
            preferredType: preferredType,
            warning: candidateTypes.relay > 0 && candidateTypes.srflx === 0 && candidateTypes.host === 0 ? '⚠️ Only TURN candidates - STUN may not be working!' : null
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
          // Determine actual connection type being used
          const connectionType = candidateTypes.host > 0 ? 'Direct (host - lowest latency ✅)' : 
                                 candidateTypes.srflx > 0 ? 'STUN (server reflexive - low latency ✅)' : 
                                 candidateTypes.relay > 0 ? 'TURN (relay - higher latency ⚠️)' : 'Unknown';
          const performance = candidateTypes.relay > 0 && (candidateTypes.srflx === 0 && candidateTypes.host === 0) 
            ? '⚠️ WARNING: Using TURN relay - STUN not working! This will cause lag.' 
            : '✅ Good connection type';
          console.log(`[WebRTC] ✅ ICE connection ${iceState} for tab ${tabId}, socket ${socket.id} - Using: ${connectionType}`, {
            performance: performance,
            candidateTypes: candidateTypes
          });
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
          const connectionType = candidateTypes.host > 0 ? 'Direct (host - lowest latency ✅)' : 
                                 candidateTypes.srflx > 0 ? 'STUN (server reflexive - low latency ✅)' : 
                                 candidateTypes.relay > 0 ? 'TURN (relay - higher latency ⚠️)' : 'Unknown';
          const performance = candidateTypes.relay > 0 && (candidateTypes.srflx === 0 && candidateTypes.host === 0) 
            ? '⚠️ WARNING: Using TURN relay - STUN not working! This will cause lag.' 
            : '✅ Good connection type';
          console.log(`[WebRTC] ✅ Connection established successfully for tab ${tabId}, socket ${socket.id} - Using: ${connectionType}`, {
            performance: performance,
            candidateTypes: candidateTypes
          });
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
