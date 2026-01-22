// Tab-related socket handlers

import { getBrowserInstance } from '../browser/browserManager.js';
import { openTab, listTabs, switchTab, closeTab } from '../browser/tabManager.js';

/**
 * Handle open_tab event
 */
export async function handleOpenTab(socket, { url }, socketBrowserMap, browserInstances, io) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) {
    socket.emit("error", { message: "Not connected to a browser. Please enter a browser code first." });
    return;
  }

  await openTab(socket, url, browserInstance, io);
}

/**
 * Handle list_tabs event
 */
export function handleListTabs(socket, socketBrowserMap, browserInstances) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) {
    socket.emit("error", { message: "Not connected to a browser" });
    return;
  }

  const tabs = listTabs(browserInstance);
  socket.emit("tabs_list", tabs);
}

/**
 * Handle switch_tab event
 */
export async function handleSwitchTab(socket, { tabId }, socketBrowserMap, browserInstances, io) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) {
    socket.emit("error", { message: "Not connected to a browser" });
    return;
  }

  await switchTab(socket, tabId, browserInstance, io);
  socket.emit("tab_switched", { tabId });
}

/**
 * Handle close_tab event
 */
export async function handleCloseTab(socket, { tabId }, socketBrowserMap, browserInstances, io) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) {
    socket.emit("error", { message: "Not connected to a browser" });
    return;
  }

  await closeTab(tabId, browserInstance, socket, io);
}
