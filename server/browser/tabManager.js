// Tab management operations

import { startCDPScreencast, stopCDPScreencast } from './screencast.js';
import { findWebSocketById, sendJSON, broadcastToTabViewers } from '../websocket/wsServer.js';

/**
 * Open a new tab
 */
export async function openTab(socket, url, browserInstance, wss) {
  const page = await browserInstance.context.newPage();
  await page.goto(url || "https://google.com");
  const tabId = `tab_${++browserInstance.tabCounter}`;
  browserInstance.pages[tabId] = page;
  browserInstance.activeTabs = [...browserInstance.activeTabs, tabId];

  // Listen for navigation events - broadcast to all viewers
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      const viewers = browserInstance.tabViewers[tabId] || new Set();
      broadcastToTabViewers(viewers, "url_changed", { tabId, url: page.url() });
    }
  });

  // Start CDP screencast streaming
  await startCDPScreencast(socket, tabId, browserInstance, wss);

  // Send immediate screenshot to the client that opened the tab
  setTimeout(async () => {
    try {
      const currentPage = browserInstance.pages[tabId];
      if (currentPage && !currentPage.isClosed()) {
        const screenshot = await currentPage.screenshot({
          type: 'jpeg',
          quality: 85,
          fullPage: false,
          timeout: 5000
        });
        socket.emit("screenshot", {
          tabId,
          image: screenshot.toString('base64')
        });
      }
    } catch (error) {
      // Screenshot might fail, that's okay
    }
  }, 100);

  // Broadcast to all clients that a new tab was opened (via wss.clients)
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      sendJSON(client, "tab_opened", { tabId, url: page.url() });
    }
  });
}

/**
 * List all tabs
 */
export function listTabs(browserInstance) {
  return Object.entries(browserInstance.pages)
    .filter(([id, p]) => !p.isClosed())
    .map(([id, p]) => ({
      tabId: id,
      url: p.url()
    }));
}

/**
 * Switch to a tab
 */
export async function switchTab(socket, tabId, browserInstance, wss) {
  const page = browserInstance.pages[tabId];
  if (!page || page.isClosed()) return;
  
  // Remove from previous tab viewers (if any)
  Object.keys(browserInstance.tabViewers).forEach(tId => {
    if (browserInstance.tabViewers[tId]) {
      browserInstance.tabViewers[tId].delete(socket.id);
      if (browserInstance.tabViewers[tId].size === 0) {
        delete browserInstance.tabViewers[tId];
      }
    }
  });
  
  await page.bringToFront();
  
  // Start CDP screencast for the new tab (adds socket to viewers)
  await startCDPScreencast(socket, tabId, browserInstance, wss);
  
  // Send immediate screenshot to this client
  setTimeout(async () => {
    try {
      const currentPage = browserInstance.pages[tabId];
      if (currentPage && !currentPage.isClosed()) {
        const screenshot = await currentPage.screenshot({
          type: 'jpeg',
          quality: 85,
          fullPage: false,
          timeout: 3000
        });
        socket.emit("screenshot", {
          tabId,
          image: screenshot.toString('base64')
        });
      }
    } catch (error) {
      // Screenshot might fail, that's okay
    }
  }, 50);
}

/**
 * Close a tab
 */
export async function closeTab(tabId, browserInstance, socket, wss) {
  const page = browserInstance.pages[tabId];
  if (!page) return;
  
  // Remove this socket from viewers
  if (browserInstance.tabViewers[tabId]) {
    browserInstance.tabViewers[tabId].delete(socket.id);
    if (browserInstance.tabViewers[tabId].size === 0) {
      delete browserInstance.tabViewers[tabId];
      // Stop screencast if no one is viewing
      await stopCDPScreencast(tabId, browserInstance);
      if (browserInstance.cdpSessions[tabId]) {
        try {
          await browserInstance.cdpSessions[tabId].detach();
        } catch (error) {
          // Session might already be closed
        }
        delete browserInstance.cdpSessions[tabId];
      }
    }
  }
  
  await page.close();
  delete browserInstance.pages[tabId];
  delete browserInstance.screencastActive[tabId];
  
  if (browserInstance.activeTabs.includes(tabId)) {
    browserInstance.activeTabs = browserInstance.activeTabs.filter(id => id !== tabId);
  }
  
  // Broadcast to all clients that this tab was closed
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      sendJSON(client, "tab_closed", { tabId });
    }
  });
}
