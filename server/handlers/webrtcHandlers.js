import wrtc from "@koush/wrtc";
const { RTCPeerConnection, RTCSessionDescription } = wrtc;
import { getBrowserInstance } from '../browser/browserManager.js';

// Store test WebRTC connections (socket.id -> { pc, dataChannel })
const testWebRTCConnections = new Map();

// Get ICE servers configuration - using multiple STUN servers and local TURN server
function getIceServers() {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Additional public STUN servers as fallback
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.voiparound.com' },
    { urls: 'stun:stun.voipbuster.com' }
  ];

  // Add local TURN server (coturn running on this EC2 instance)
  const turnUrl = process.env.TURN_URL || 'turn:13.126.43.172:3478';
  const turnUsername = process.env.TURN_USERNAME || 'turnuser';
  const turnCredential = process.env.TURN_CREDENTIAL || 'turnpassword';

  iceServers.push({
    urls: turnUrl,
    username: turnUsername,
    credential: turnCredential
  });
  
  console.log(`[WebRTC] TURN server configured: ${turnUrl}`);

  return iceServers;
}

export function setupWebRTCHandlers(socket) {
  // WebRTC signaling handlers - client sends answer (handles both test and regular connections)
  socket.on("webrtc_answer", async ({ tabId, answer, iceRestart }) => {
    // If no tabId, this is a test connection
    if (!tabId) {
      const testConn = testWebRTCConnections.get(socket.id);
      if (testConn && testConn.pc && answer) {
        try {
          await testConn.pc.setRemoteDescription(new RTCSessionDescription(answer));
          if (iceRestart) {
            console.log(`[WebRTC Test] ICE restart answer received and set for socket ${socket.id}`);
          } else {
            console.log(`[WebRTC Test] Answer received and set for socket ${socket.id}`);
          }
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
          // Track remote candidates
          if (!testConn.remoteCandidateCount) testConn.remoteCandidateCount = 0;
          testConn.remoteCandidateCount++;
          
          await testConn.pc.addIceCandidate(candidate);
          
          // Extract IP and port for diagnostics
          const candidateStr = candidate.candidate || '';
          const ipMatch = candidateStr.match(/(\d+\.\d+\.\d+\.\d+)/);
          const portMatch = candidateStr.match(/port (\d+)/);
          const ip = ipMatch ? ipMatch[1] : 'unknown';
          const port = portMatch ? portMatch[1] : 'unknown';
          
          console.log(`[WebRTC Test] Remote ICE candidate #${testConn.remoteCandidateCount} added for socket ${socket.id}:`, {
            type: candidateStr.includes(' typ host ') ? 'host' : 
                  candidateStr.includes(' typ srflx ') ? 'srflx' :
                  candidateStr.includes(' typ relay ') ? 'relay' : 'prflx',
            ip: ip,
            port: port,
            candidate: candidateStr.substring(0, 150),
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid
          });
        } catch (error) {
          console.error(`[WebRTC Test] Error adding ICE candidate:`, error.message);
          console.error(`[WebRTC Test] Candidate details:`, {
            candidate: candidate.candidate?.substring(0, 100),
            sdpMLineIndex: candidate.sdpMLineIndex,
            sdpMid: candidate.sdpMid
          });
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
      
      // Track ICE candidates for diagnostics
      let localCandidateCount = 0;
      let remoteCandidateCount = 0;
      const candidateTypes = { host: 0, srflx: 0, relay: 0, prflx: 0 };
      
      // Create peer connection with optimized settings for STUN-only
      const pc = new RTCPeerConnection({
        iceServers: getIceServers(),
        iceCandidatePoolSize: 10, // Pre-gather more candidates for better connectivity
        iceTransportPolicy: 'all' // Allow all candidate types (host, srflx, but not relay since we don't have TURN)
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
          localCandidateCount++;
          const candidate = event.candidate.candidate;
          
          // Track candidate types for diagnostics
          if (candidate.includes(' typ host ')) candidateTypes.host++;
          else if (candidate.includes(' typ srflx ')) candidateTypes.srflx++;
          else if (candidate.includes(' typ relay ')) candidateTypes.relay++;
          else if (candidate.includes(' typ prflx ')) candidateTypes.prflx++;
          
          // Extract IP and port for diagnostics
          const ipMatch = candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
          const portMatch = candidate.match(/port (\d+)/);
          const ip = ipMatch ? ipMatch[1] : 'unknown';
          const port = portMatch ? portMatch[1] : 'unknown';
          
          console.log(`[WebRTC Test] Local ICE candidate #${localCandidateCount} for socket ${socket.id}:`, {
            type: candidate.includes(' typ host ') ? 'host' : 
                  candidate.includes(' typ srflx ') ? 'srflx' :
                  candidate.includes(' typ relay ') ? 'relay' : 'prflx',
            ip: ip,
            port: port,
            candidate: candidate.substring(0, 150),
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid
          });
          
          socket.emit('webrtc_ice_candidate', {
            candidate: event.candidate
          });
        } else {
          console.log(`[WebRTC Test] ICE candidate gathering complete for socket ${socket.id}. Total candidates: ${localCandidateCount}`, {
            types: candidateTypes,
            gatheringState: pc.iceGatheringState,
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState
          });
        }
      };

      // Store connection with candidate tracking (before handlers so they can reference it)
      const testConn = { pc, dataChannel, remoteCandidateCount: 0 };
      testWebRTCConnections.set(socket.id, testConn);

      // Connection state handlers
      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState;
        const connState = pc.connectionState;
        const gatheringState = pc.iceGatheringState;
        
        console.log(`[WebRTC Test] ICE connection state changed for socket ${socket.id}:`, {
          iceConnectionState: iceState,
          connectionState: connState,
          iceGatheringState: gatheringState,
          localCandidates: localCandidateCount,
          remoteCandidates: testConn.remoteCandidateCount || 0
        });
        
        if (iceState === 'failed') {
          // Attempt ICE restart for STUN-only connections (might help with timing issues)
          if (testConn.iceRestartAttempted === undefined) {
            testConn.iceRestartAttempted = false;
          }
          
          if (!testConn.iceRestartAttempted && candidateTypes.srflx > 0) {
            // STUN is working, try ICE restart once
            console.log(`[WebRTC Test] Attempting ICE restart for socket ${socket.id}...`);
            testConn.iceRestartAttempted = true;
            
            // Create new offer with ICE restart
            pc.createOffer({ iceRestart: true })
              .then(offer => {
                return pc.setLocalDescription(offer);
              })
              .then(() => {
                socket.emit('webrtc_offer', {
                  offer: pc.localDescription,
                  iceRestart: true
                });
                console.log(`[WebRTC Test] ICE restart offer sent for socket ${socket.id}`);
              })
              .catch(error => {
                console.error(`[WebRTC Test] ICE restart failed for socket ${socket.id}:`, error);
              });
            
            return; // Don't log error yet, wait for restart attempt
          }
          
          console.error(`[WebRTC Test] ❌ ICE connection failed for socket ${socket.id}. Possible causes:`, {
            networkIssue: 'Firewall/NAT blocking UDP traffic - AWS Security Group may not allow inbound UDP',
            stunIssue: candidateTypes.srflx === 0 ? 'STUN server not working - no srflx candidates' : 'STUN working (srflx candidates found)',
            natIssue: candidateTypes.host > 0 && candidateTypes.srflx > 0 ? 'Both host and srflx candidates found, but connection failed - likely symmetric NAT or firewall blocking' : 'Insufficient candidate types',
            iceRestartAttempted: testConn.iceRestartAttempted || false,
            candidateCounts: {
              local: localCandidateCount,
              remote: testConn.remoteCandidateCount || 0,
              types: candidateTypes
            },
            recommendation: candidateTypes.srflx === 0 
              ? 'CRITICAL: STUN not working - check outbound UDP to port 19302, verify STUN servers reachable'
              : 'CRITICAL: Configure AWS Security Group to allow inbound UDP ports 10000-20000. If both sides are behind symmetric NAT, direct connection may not be possible - but try Security Group first!'
          });
        } else if (iceState === 'connected' || iceState === 'completed') {
          console.log(`[WebRTC Test] ✅ ICE connection ${iceState} for socket ${socket.id}`);
        }
      };

      pc.onconnectionstatechange = () => {
        const connState = pc.connectionState;
        const iceState = pc.iceConnectionState;
        const gatheringState = pc.iceGatheringState;
        
        console.log(`[WebRTC Test] Connection state changed for socket ${socket.id}:`, {
          connectionState: connState,
          iceConnectionState: iceState,
          iceGatheringState: gatheringState,
          dataChannelState: dataChannel.readyState,
          localCandidates: localCandidateCount,
          remoteCandidates: testConn.remoteCandidateCount || 0
        });
        
        if (connState === 'failed' || connState === 'closed') {
          const hasSrflx = candidateTypes.srflx > 0;
          const hasHost = candidateTypes.host > 0;
          const hasBothCandidates = localCandidateCount > 0 && (testConn.remoteCandidateCount || 0) > 0;
          
          console.error(`[WebRTC Test] ❌ Connection ${connState} for socket ${socket.id}. Final diagnostics:`, {
            iceConnectionState: iceState,
            iceGatheringState: gatheringState,
            dataChannelState: dataChannel.readyState,
            candidateCounts: {
              local: localCandidateCount,
              remote: testConn.remoteCandidateCount || 0,
              types: candidateTypes
            },
            analysis: {
              stunWorking: hasSrflx,
              hasLocalCandidates: hasHost,
              candidatesExchanged: hasBothCandidates,
              likelyCause: !hasSrflx 
                ? 'STUN server not reachable or blocked'
                : !hasBothCandidates
                ? 'ICE candidates not exchanged properly'
                : 'AWS Security Group blocking inbound UDP OR symmetric NAT preventing direct connection'
            },
            recommendation: !hasSrflx
              ? 'CRITICAL: Fix STUN - check outbound UDP to port 19302, verify firewall allows outbound UDP'
              : !hasBothCandidates
              ? 'CRITICAL: ICE candidates not exchanged - check WebSocket connection and signaling'
              : 'CRITICAL: Configure AWS Security Group inbound rules: Allow UDP ports 10000-20000 from 0.0.0.0/0. If still fails, may need TURN server for symmetric NAT traversal.'
          });
          testWebRTCConnections.delete(socket.id);
        } else if (connState === 'connected') {
          console.log(`[WebRTC Test] ✅ Connection established successfully for socket ${socket.id}`);
        }
      };


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
