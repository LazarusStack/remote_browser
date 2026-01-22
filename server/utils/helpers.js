// Utility helper functions

/**
 * Get browser ID by code
 */
export function getBrowserByCode(code, browserList) {
  const browser = browserList.find(b => b.code === code);
  return browser ? browser.id : null;
}

/**
 * Create a new browser instance structure
 */
export function createBrowserInstance() {
  return {
    browser: null,
    context: null,
    pages: {}, // tabId -> page
    tabCounter: 0,
    activeTabs: [], // tabId
    cdpSessions: {}, // tabId -> CDP session
    screencastActive: {}, // tabId -> boolean
    tabViewers: {} // tabId -> Set of socketIds viewing this tab
  };
}
