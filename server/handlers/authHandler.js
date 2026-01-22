// Authentication handlers

import { getBrowserByCode } from '../utils/helpers.js';
import { browserList } from '../config/index.js';
import { initBrowser } from '../browser/browserManager.js';

/**
 * Handle browser connection authentication
 */
export async function handleConnectBrowser(socket, { code }, socketBrowserMap, browserInstances) {
  try {
    const browserId = getBrowserByCode(code, browserList);
    if (!browserId) {
      socket.emit("browser_auth_error", { message: "Invalid browser code" });
      return;
    }

    // Initialize browser if not already initialized
    const browserInstance = await initBrowser(browserId, browserInstances);
    socketBrowserMap[socket.id] = browserId;

    // Send success with browser info
    const browserInfo = browserList.find(b => b.id === browserId);
    socket.emit("browser_connected", {
      browserId,
      name: browserInfo.name,
      code: browserInfo.code
    });

    console.log(`Client ${socket.id} connected to browser ${browserId} with code ${code}`);
  } catch (error) {
    console.error("Error connecting to browser:", error);
    socket.emit("browser_auth_error", { message: "Failed to connect to browser" });
  }
}
