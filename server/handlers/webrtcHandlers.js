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
    if (!browserInstance) return;

    try {
      const pc = browserInstance.webrtcConnections[socket.id]?.[tabId];
      if (pc && candidate) {
        await pc.addIceCandidate(candidate);
      }
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  });
}
