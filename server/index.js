// index.js
// Cloud browser with full mirroring and interaction support

import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

let browser;
let context;
let pages = {}; // tabId -> page
let tabCounter = 0;
let activeTabs = []; // tabId
const cdpSessions = {}; // tabId -> CDP session
const screencastActive = {}; // tabId -> boolean
const tabViewers = {}; // tabId -> Set of socketIds viewing this tab
let chromium;

async function initBrowser() {
  // Dynamic import to avoid ES module compatibility issues
  const playwright = await import("playwright");
  chromium = playwright.chromium;
  browser = await chromium.launch({ 
    headless: true,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });
  context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  });
}


async function startCDPScreencast(socket, tabId) {
  const page = pages[tabId];
  if (!page || page.isClosed()) return;

  // Add this socket to the viewers of this tab
  if (!tabViewers[tabId]) {
    tabViewers[tabId] = new Set();
  }
  tabViewers[tabId].add(socket.id);

  // Stop existing screencast for this tab if any
  if (screencastActive[tabId]) {
    await stopCDPScreencast(tabId);
  }

  try {
    // Get or create CDP session for this page
    let cdpSession = cdpSessions[tabId];
    if (!cdpSession) {
      // Create CDP session from the page
      cdpSession = await page.context().newCDPSession(page);
      cdpSessions[tabId] = cdpSession;

      // Listen for screencast frames
      cdpSession.on('Page.screencastFrame', async (event) => {
        if (!screencastActive[tabId] || !pages[tabId] || pages[tabId].isClosed()) {
          return;
        }

        try {
          const { data, sessionId } = event;


          
          // Broadcast frame to ALL clients viewing this tab
          const viewers = tabViewers[tabId] || new Set();
          viewers.forEach(socketId => {
            const viewerSocket = io.sockets.sockets.get(socketId);
            if (viewerSocket) {
              viewerSocket.emit("screenshot", {
                tabId,
                image: data
              });
            }
          });

          // Notify CDP that we've processed the frame
          await cdpSession.send('Page.screencastFrameAck', { sessionId }).catch(() => {
            // Ignore errors if session is closed
          });
        } catch (error) {
          // Silently handle errors - page might be closing
          if (!error.message.includes('closed') && !error.message.includes('Target closed')) {
            console.error("Error processing screencast frame:", error.message);
          }
        }
      });

      // Handle CDP session errors
      cdpSession.on('error', (error) => {
        console.error("CDP session error:", error.message);
        delete cdpSessions[tabId];
        screencastActive[tabId] = false;
      });
    }

    // Start screencast with optimized settings
    await cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 85,
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 1 // Send every frame for smooth experience
    });

    screencastActive[tabId] = true;
  } catch (error) {
    console.error("Error starting CDP screencast:", error.message);
    screencastActive[tabId] = false;
  }
}

async function stopCDPScreencast(tabId) {
  try {
    const cdpSession = cdpSessions[tabId];
    if (cdpSession && screencastActive[tabId]) {
      await cdpSession.send('Page.stopScreencast');
      screencastActive[tabId] = false;
    }
  } catch (error) {
    console.error("Error stopping CDP screencast:", error.message);
  }
}

io.on("connection", async (socket) => {
  console.log("Client connected", socket.id);

  socket.on("open_tab", async ({ url }) => {
    const page = await context.newPage();
    await page.goto(url || "https://google.com");
    const tabId = `tab_${++tabCounter}`;
    pages[tabId] = page;
    activeTabs = [...activeTabs, tabId];

    // Listen for navigation events - broadcast to all viewers
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        const viewers = tabViewers[tabId] || new Set();
        viewers.forEach(socketId => {
          const viewerSocket = io.sockets.sockets.get(socketId);
          if (viewerSocket) {
            viewerSocket.emit("url_changed", { tabId, url: page.url() });
          }
        });
      }
    });

    // Start CDP screencast streaming
    await startCDPScreencast(socket, tabId);

    // Send immediate screenshot to the client that opened the tab
    setTimeout(async () => {
      try {
        const currentPage = pages[tabId];
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
  });

  socket.on("list_tabs", async () => {
    const tabs = Object.entries(pages)
      .filter(([id, p]) => !p.isClosed())
      .map(([id, p]) => ({
        tabId: id,
        url: p.url()
      }));
    socket.emit("tabs_list", tabs);
  });

  socket.on("switch_tab", async ({ tabId }) => {
    const page = pages[tabId];
    if (!page || page.isClosed()) return;
    
    // Remove from previous tab viewers (if any)
    Object.keys(tabViewers).forEach(tId => {
      if (tabViewers[tId]) {
        tabViewers[tId].delete(socket.id);
        if (tabViewers[tId].size === 0) {
          delete tabViewers[tId];
        }
      }
    });
    
    await page.bringToFront();
    
    // Start CDP screencast for the new tab (adds socket to viewers)
    await startCDPScreencast(socket, tabId);
    
    // Send immediate screenshot to this client
    setTimeout(async () => {
      try {
        const currentPage = pages[tabId];
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

  socket.on("close_tab", async ({ tabId }) => {
    const page = pages[tabId];
    if (!page) return;
    
    // Remove this socket from viewers
    if (tabViewers[tabId]) {
      tabViewers[tabId].delete(socket.id);
      if (tabViewers[tabId].size === 0) {
        delete tabViewers[tabId];
        // Stop screencast if no one is viewing
        await stopCDPScreencast(tabId);
        if (cdpSessions[tabId]) {
          try {
            await cdpSessions[tabId].detach();
          } catch (error) {
            // Session might already be closed
          }
          delete cdpSessions[tabId];
        }
      }
    }
    
    await page.close();
    delete pages[tabId];
    delete screencastActive[tabId];
    
    if (activeTabs.includes(tabId)) {
      activeTabs = activeTabs.filter(id => id !== tabId);
    }
    
    // Broadcast to all clients that this tab was closed
    io.emit("tab_closed", { tabId });
  });

  // Mouse click handler
  socket.on("mouse_click", async ({ tabId, x, y, button = "left" }) => {
    const page = pages[tabId];
    if (!page || page.isClosed()) return;
    
    try {
      await page.mouse.click(x, y, { button });
    } catch (error) {
      console.error("Click error:", error);
    }
  });

  // Mouse move handler
  socket.on("mouse_move", async ({ tabId, x, y }) => {
    const page = pages[tabId];
    if (!page || page.isClosed()) return;
    
    try {
      await page.mouse.move(x, y);
    } catch (error) {
      console.error("Mouse move error:", error);
    }
  });

  // Keyboard input handler
  socket.on("keyboard_input", async ({ tabId, text, key }) => {
    const page = pages[tabId];
    if (!page || page.isClosed()) return;
    
    try {
      if (key) {
        await page.keyboard.press(key);
      } else if (text) {
        await page.keyboard.type(text);
      }
    } catch (error) {
      console.error("Keyboard error:", error);
    }
  });

  // Scroll handler
  socket.on("scroll", async ({ tabId, deltaX, deltaY }) => {
    const page = pages[tabId];
    if (!page || page.isClosed()) return;
    
    try {
      await page.mouse.wheel(deltaX || 0, deltaY || 0);
    } catch (error) {
      console.error("Scroll error:", error);
    }
  });

  // Navigation handler
  socket.on("navigate", async ({ tabId, url }) => {
    const page = pages[tabId];
    if (!page || page.isClosed()) return;
    
    try {
      await page.goto(url);
    } catch (error) {
      console.error("Navigation error:", error);
    }
  });

  // Cleanup on disconnect
  socket.on("disconnect", async () => {
    // Remove this socket from all tab viewers
    Object.keys(tabViewers).forEach(tabId => {
      if (tabViewers[tabId]) {
        tabViewers[tabId].delete(socket.id);
        if (tabViewers[tabId].size === 0) {
          delete tabViewers[tabId];
          // Stop screencast if no one is viewing
          stopCDPScreencast(tabId).catch(() => {});
        }
      }
    });
    console.log("Client disconnected", socket.id);
  });
});

(async () => {
  await initBrowser();
  server.listen(3000, () => {
    console.log("Server running on port 3000");
  });
})();
