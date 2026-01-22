// Browser instance management

import { createBrowserInstance } from '../utils/helpers.js';
import { config } from '../config/index.js';

let chromium = null;

/**
 * Initialize Chromium reference
 */
export async function initChromium() {
  if (!chromium) {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  }
  return chromium;
}

/**
 * Initialize a browser instance for a given browserId
 */
export async function initBrowser(browserId, browserInstances) {
  // Check if browser instance already exists
  if (browserInstances[browserId]?.browser) {
    return browserInstances[browserId];
  }

  const playwright = await import("playwright");
  const chromium = playwright.chromium;
  
  const browser = await chromium.launch({ 
    headless: true,
    args: config.browser.args
  });
  
  const context = await browser.newContext({
    viewport: config.browser.viewport,
    ignoreHTTPSErrors: true
  });

  // Create or update browser instance
  if (!browserInstances[browserId]) {
    browserInstances[browserId] = createBrowserInstance();
  }
  
  browserInstances[browserId].browser = browser;
  browserInstances[browserId].context = context;
  
  return browserInstances[browserId];
}

/**
 * Get browser instance for a socket
 */
export function getBrowserInstance(socket, socketBrowserMap, browserInstances) {
  const browserId = socketBrowserMap[socket.id];
  if (!browserId) {
    return null;
  }
  return browserInstances[browserId];
}
