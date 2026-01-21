import wrtc from "@koush/wrtc";
const { RTCSessionDescription } = wrtc;
import { getBrowserInstance } from '../browser/browserManager.js';

export function setupWebRTCHandlers(socket) {
  // WebRTC signaling handlers - client sends answer
  socket.on("webrtc_answer", async ({ tabId, answer }) => {
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
}
