import { getBrowserInstance } from '../browser/browserManager.js';
import { startCDPScreencast, stopCDPScreencast } from '../cdp/screencast.js';
import { cleanupWebRTC } from '../webrtc/webrtcManager.js';

export function setupTabHandlers(socket, io) {

  // Open a new tab
  socket.on("open_tab", async ({ url }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) {
      socket.emit("error", { message: "Not connected to a browser. Please enter a browser code first." });
      return;
    }

    try {
      const page = await browserInstance.context.newPage();
      
      // Navigate with timeout and better error handling
      try {
        await page.goto(url || "https://google.com", {
          waitUntil: 'networkidle',
          timeout: 30000
        });
      } catch (navError) {
        console.error("Navigation error:", navError);
        // Check if it's a blocked/forbidden error
        if (navError.message.includes('net::ERR_BLOCKED_BY_CLIENT') || 
            navError.message.includes('net::ERR_BLOCKED_BY_RESPONSE') ||
            navError.message.includes('net::ERR_ACCESS_DENIED')) {
          socket.emit("error", { 
            message: `Site blocked: ${url}. The website may be blocking automated browsers. Try a different site or check server logs.` 
          });
        } else {
          socket.emit("error", { 
            message: `Failed to load ${url}: ${navError.message}` 
          });
        }
        // Still create the tab so user can see the error
      }
      
      const tabId = `tab_${++browserInstance.tabCounter}`;
      browserInstance.pages[tabId] = page;
      browserInstance.activeTabs = [...browserInstance.activeTabs, tabId];

      // Listen for navigation events - broadcast to all viewers
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) {
          const viewers = browserInstance.tabViewers[tabId] || new Set();
          viewers.forEach(socketId => {
            const viewerSocket = io.sockets.sockets.get(socketId);
            if (viewerSocket) {
              viewerSocket.emit("url_changed", { tabId, url: page.url() });
            }
          });
        }
      });

      // Start CDP screencast streaming
      await startCDPScreencast(socket, tabId, browserInstance, io);

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

      // Broadcast to all clients that a new tab was opened
      io.emit("tab_opened", { tabId, url: page.url() });
    } catch (error) {
      console.error("Error opening tab:", error);
      socket.emit("error", { message: `Failed to open tab: ${error.message}` });
    }
  });

  // List all tabs
  socket.on("list_tabs", async () => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) {
      socket.emit("error", { message: "Not connected to a browser" });
      return;
    }

    const tabs = Object.entries(browserInstance.pages)
      .filter(([id, p]) => !p.isClosed())
      .map(([id, p]) => ({
        tabId: id,
        url: p.url()
      }));
    socket.emit("tabs_list", tabs);
  });

  // Switch to a tab
  socket.on("switch_tab", async ({ tabId }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) {
      socket.emit("error", { message: "Not connected to a browser" });
      return;
    }

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
    await startCDPScreencast(socket, tabId, browserInstance, io);

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

    socket.emit("tab_switched", { tabId });
  });

  // Close a tab
  socket.on("close_tab", async ({ tabId }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) {
      socket.emit("error", { message: "Not connected to a browser" });
      return;
    }

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

    // Cleanup WebRTC for this tab
    cleanupWebRTC(socket.id, tabId, browserInstance);

    await page.close();
    delete browserInstance.pages[tabId];
    delete browserInstance.screencastActive[tabId];

    if (browserInstance.activeTabs.includes(tabId)) {
      browserInstance.activeTabs = browserInstance.activeTabs.filter(id => id !== tabId);
    }

    // Broadcast to all clients that this tab was closed
    io.emit("tab_closed", { tabId });
  });

  // Navigate to a URL
  socket.on("navigate", async ({ tabId, url }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (!page || page.isClosed()) return;

    try {
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
    } catch (error) {
      console.error("Navigation error:", error);
      // Check if it's a blocked/forbidden error
      if (error.message.includes('net::ERR_BLOCKED_BY_CLIENT') || 
          error.message.includes('net::ERR_BLOCKED_BY_RESPONSE') ||
          error.message.includes('net::ERR_ACCESS_DENIED')) {
        socket.emit("error", { 
          message: `Site blocked: ${url}. The website may be blocking automated browsers.` 
        });
      } else {
        socket.emit("error", { 
          message: `Failed to navigate to ${url}: ${error.message}` 
        });
      }
    }
  });
}
