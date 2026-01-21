import { getBrowserByCode, browserList } from '../config/browsers.js';
import { initBrowser, socketBrowserMap } from '../browser/browserManager.js';

export function setupAuthHandlers(socket) {
  // Authenticate with browser code
  socket.on("connect_browser", async ({ code }) => {
    try {
      const browserId = getBrowserByCode(code);
      if (!browserId) {
        socket.emit("browser_auth_error", { message: "Invalid browser code" });
        return;
      }

      // Initialize browser if not already initialized
      const browserInstance = await initBrowser(browserId);
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
  });
}
