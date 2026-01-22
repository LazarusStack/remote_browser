// Disconnect cleanup handler

import { getBrowserInstance } from '../browser/browserManager.js';
import { stopCDPScreencast } from '../browser/screencast.js';

/**
 * Handle client disconnect - cleanup resources
 */
export async function handleDisconnect(socket, socketBrowserMap, browserInstances) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (browserInstance) {
    // Remove this socket from all tab viewers
    Object.keys(browserInstance.tabViewers).forEach(tabId => {
      if (browserInstance.tabViewers[tabId]) {
        browserInstance.tabViewers[tabId].delete(socket.id);
        if (browserInstance.tabViewers[tabId].size === 0) {
          delete browserInstance.tabViewers[tabId];
          // Stop screencast if no one is viewing
          stopCDPScreencast(tabId, browserInstance).catch(() => {});
        }
      }
    });
  }
  
  // Remove socket from browser map
  delete socketBrowserMap[socket.id];
  
  console.log("Client disconnected", socket.id);
}
