import wrtc from "@koush/wrtc";
const { RTCSessionDescription } = wrtc;
import { getBrowserInstance } from '../browser/browserManager.js';

export function setupWebRTCHandlers(socket) {
  // WebRTC signaling handlers - client sends answer
  socket.on("webrtc_answer", async ({ tabId, answer }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    try {
      const pc = browserInstance.webrtcConnections[socket.id]?.[tabId];
      if (pc && answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`WebRTC answer received for tab ${tabId}`);
      }
    } catch (error) {
      console.error("Error handling WebRTC answer:", error);
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
