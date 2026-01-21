import { getBrowserInstance, socketBrowserMap } from '../browser/browserManager.js';
import { stopCDPScreencast } from '../cdp/screencast.js';
import { cleanupWebRTC } from '../webrtc/webrtcManager.js';

export function setupDisconnectHandler(socket) {
  // Cleanup on disconnect
  socket.on("disconnect", async () => {
    const browserInstance = getBrowserInstance(socket);
    if (browserInstance) {
      // Remove this socket from all tab viewers
      Object.keys(browserInstance.tabViewers).forEach(tabId => {
        if (browserInstance.tabViewers[tabId]) {
          browserInstance.tabViewers[tabId].delete(socket.id);
          if (browserInstance.tabViewers[tabId].size === 0) {
            delete browserInstance.tabViewers[tabId];
            // Stop screencast if no one is viewing
            stopCDPScreencast(tabId, browserInstance).catch(() => { });
          }
        }
      });

      // Cleanup all WebRTC connections for this socket
      if (browserInstance.webrtcConnections[socket.id]) {
        Object.keys(browserInstance.webrtcConnections[socket.id]).forEach(tabId => {
          cleanupWebRTC(socket.id, tabId, browserInstance);
        });
        delete browserInstance.webrtcConnections[socket.id];
      }
      if (browserInstance.webrtcDataChannels[socket.id]) {
        delete browserInstance.webrtcDataChannels[socket.id];
      }
    }

    // Remove socket from browser map
    delete socketBrowserMap[socket.id];

    console.log("Client disconnected", socket.id);
  });
}
