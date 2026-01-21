// index.js
// Cloud browser with full mirroring and interaction support

import express from "express";
import http from "http";
import { Server } from "socket.io";
import wrtc from "@koush/wrtc";
const { RTCPeerConnection, RTCSessionDescription } = wrtc;

const app = express();
const server = http.createServer(app);

// Get port and allowed origins from environment variables
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ["*"];

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS.includes("*") ? "*" : ALLOWED_ORIGINS,
    credentials: true
  }
});

// Mock browser list - in future, fetch from database
const browserList = [
  { id: "browser_1", code: "ABC123", name: "Browser 1" },
  { id: "browser_2", code: "XYZ789", name: "Browser 2" },
  { id: "browser_3", code: "DEF456", name: "Browser 3" },
  { id: "browser_4", code: "GHI012", name: "Browser 4" },
  { id: "browser_5", code: "JKL345", name: "Browser 5" }
];

// Browser instances storage: browserId -> { browser, context, pages, tabCounter, etc. }
const browserInstances = {}; // browserId -> browser instance data
const socketBrowserMap = {}; // socketId -> browserId (which browser this socket is connected to)
let chromium;

// Structure for each browser instance
function createBrowserInstance() {
  return {
    browser: null,
    context: null,
    pages: {}, // tabId -> page
    tabCounter: 0,
    activeTabs: [], // tabId
    tabViewers: {}, // tabId -> Set of socketIds viewing this tab
    webrtcConnections: {}, // socketId -> { tabId -> RTCPeerConnection }
    cursorState: {}, // tabId -> { x, y, socketId }
  };
}

async function initChromium() {
  if (!chromium) {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  }
  return chromium;
}

async function initBrowser(browserId) {
  // Check if browser instance already exists
  if (browserInstances[browserId]?.browser) {
    return browserInstances[browserId];
  }

  const playwright = await import("playwright");
  const chromium = playwright.chromium;

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    
      '--enable-webrtc-pipewire-capturer',
      '--use-fake-ui-for-media-stream',
      '--allow-http-screen-capture',
      '--auto-select-desktop-capture-source=tab',
    
      // Performance
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
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

// Get browser instance by code
function getBrowserByCode(code) {
  const browser = browserList.find(b => b.code === code);
  return browser ? browser.id : null;
}

// Setup WebRTC connection for a client viewing a tab (signaling only)
async function setupWebRTC(socket, tabId, browserInstance) {
  if (!browserInstance.webrtcConnections[socket.id]) {
    browserInstance.webrtcConnections[socket.id] = {};
  }

  let pc = browserInstance.webrtcConnections[socket.id][tabId];
  if (pc) return pc;

  pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  browserInstance.webrtcConnections[socket.id][tabId] = pc;

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc_ice_candidate', { tabId, candidate: event.candidate });
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit('webrtc_offer', {
    tabId,
    offer: pc.localDescription
  });

  return pc;
}

function cleanupWebRTC(socketId, tabId, browserInstance) {
  if (browserInstance.webrtcConnections[socketId] && browserInstance.webrtcConnections[socketId][tabId]) {
    browserInstance.webrtcConnections[socketId][tabId].close();
    delete browserInstance.webrtcConnections[socketId][tabId];
  }
}


// Helper function to get browser instance for a socket
function getBrowserInstance(socket) {
  const browserId = socketBrowserMap[socket.id];
  if (!browserId) {
    return null;
  }
  return browserInstances[browserId];
}

io.on("connection", async (socket) => {
  console.log("Client connected", socket.id);

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

  socket.on("open_tab", async ({ url }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) {
      socket.emit("error", { message: "Not connected to a browser. Please enter a browser code first." });
      return;
    }

    const page = await browserInstance.context.newPage();
    await page.addInitScript(() => {
      window.__startWebRTC = async (tabId) => {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 60 },
          audio: false
        });

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            window.socket.emit('webrtc_ice_candidate', {
              tabId,
              candidate: e.candidate
            });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        window.socket.emit('webrtc_offer', {
          tabId,
          offer: pc.localDescription
        });

        window.__pc = pc;
      };
    });
    await page.goto(url || "https://google.com");
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

    await page.evaluate((tabId) => {
      window.__startWebRTC(tabId);
    }, tabId);

    await setupWebRTC(socket, tabId, browserInstance);

    // Broadcast to all clients that a new tab was opened
    io.emit("tab_opened", { tabId, url: page.url() });
  });

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

    await setupWebRTC(socket, tabId, browserInstance);

    socket.emit("tab_switched", { tabId });
    // Send last known cursor position for this tab (if any)
    if (browserInstance.cursorState[tabId]) {
      socket.emit("cursor_move", {
        tabId,
        x: browserInstance.cursorState[tabId].x,
        y: browserInstance.cursorState[tabId].y,
        from: browserInstance.cursorState[tabId].socketId
      });
    }
  });

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
      }
    }

    // Cleanup WebRTC for this tab
    cleanupWebRTC(socket.id, tabId, browserInstance);

    await page.close();
    delete browserInstance.pages[tabId];

    if (browserInstance.activeTabs.includes(tabId)) {
      browserInstance.activeTabs = browserInstance.activeTabs.filter(id => id !== tabId);
    }

    // Clear cursor state
    delete browserInstance.cursorState[tabId];

    // Broadcast to all clients that this tab was closed
    io.emit("tab_closed", { tabId });
  });

  // Mouse click handler
  socket.on("mouse_click", async ({ tabId, x, y, button = "left" }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (!page || page.isClosed()) return;

    try {
      await page.mouse.click(x, y, { button });
    } catch (error) {
      console.error("Click error:", error);
    }
  });

  // Mouse move handler (with cursor broadcast)
  socket.on("mouse_move", async ({ tabId, x, y }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (!page || page.isClosed()) return;

    try {
      await page.mouse.move(x, y);

      // Store cursor state
      browserInstance.cursorState[tabId] = {
        x,
        y,
        socketId: socket.id
      };

      // Broadcast cursor position to other viewers of this tab
      const viewers = browserInstance.tabViewers[tabId];
      if (viewers) {
        viewers.forEach(viewerSocketId => {
          if (viewerSocketId !== socket.id) {
            const viewerSocket = io.sockets.sockets.get(viewerSocketId);
            if (viewerSocket) {
              viewerSocket.emit("cursor_move", {
                tabId,
                x,
                y,
                from: socket.id
              });
            }
          }
        });
      }
    } catch (error) {
      console.error("Mouse move error:", error);
    }
  });

  // Keyboard input handler
  socket.on("keyboard_input", async ({ tabId, text, key }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (!page || page.isClosed()) return;

    try {
      if (key) {
        // Check if it's a key combination (e.g., "Control+c", "Meta+v")
        if (key.includes("+")) {
          const parts = key.split("+");
          const modifiers = parts.slice(0, -1); // All except last
          const mainKey = parts[parts.length - 1]; // Last part is the actual key

          // Press modifiers
          for (const modifier of modifiers) {
            await page.keyboard.down(modifier);
          }

          // Press the main key
          await page.keyboard.press(mainKey);

          // Release modifiers
          for (const modifier of modifiers.reverse()) {
            await page.keyboard.up(modifier);
          }
        } else {
          // Single key press
          await page.keyboard.press(key);
        }
      } else if (text) {
        await page.keyboard.type(text);
      }
    } catch (error) {
      console.error("Keyboard error:", error);
    }
  });

  // Scroll handler
  socket.on("scroll", async ({ tabId, deltaX, deltaY }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (!page || page.isClosed()) return;

    try {
      await page.mouse.wheel(deltaX || 0, deltaY || 0);
    } catch (error) {
      console.error("Scroll error:", error);
    }
  });

  // Navigation handler
  socket.on("navigate", async ({ tabId, url }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (!page || page.isClosed()) return;

    try {
      await page.goto(url);
    } catch (error) {
      console.error("Navigation error:", error);
    }
  });

  // Set cookies handler - applies cookies to browser context
  socket.on("set_cookies", async ({ cookies }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) {
      socket.emit("error", { message: "Not connected to a browser" });
      return;
    }

    try {
      // Transform cookies to Playwright format
      // Chrome extension format is mostly compatible, but we need to ensure required fields
      const playwrightCookies = cookies.map(cookie => {
        // Playwright requires: name, value, and either domain or url
        const pwCookie = {
          name: cookie.name,
          value: cookie.value,
          path: cookie.path || '/',
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || false
        };

        // Handle domain - Playwright accepts domain with or without leading dot
        if (cookie.domain) {
          pwCookie.domain = cookie.domain;
        }

        // Handle expiration date - Playwright expects Unix timestamp in seconds
        if (cookie.expirationDate) {
          pwCookie.expires = Math.floor(cookie.expirationDate);
        }

        // Handle sameSite - convert Chrome format to Playwright format
        if (cookie.sameSite) {
          if (cookie.sameSite === 'no_restriction') {
            pwCookie.sameSite = 'None';
          } else if (cookie.sameSite === 'lax') {
            pwCookie.sameSite = 'Lax';
          } else if (cookie.sameSite === 'strict') {
            pwCookie.sameSite = 'Strict';
          }
          // 'unspecified' is not set, Playwright will use default
        }

        return pwCookie;
      });

      // Add cookies to the browser context (shared across all pages and future pages)
      // This is the correct way - cookies set on context are available to all pages
      await browserInstance.context.addCookies(playwrightCookies);

      console.log(`Successfully set ${playwrightCookies.length} cookies for browser ${socketBrowserMap[socket.id]}`);
      socket.emit("cookies_set", { success: true, count: playwrightCookies.length });
    } catch (error) {
      console.error("Error setting cookies:", error);
      socket.emit("cookies_set", { success: false, error: error.message });
    }
  });

  // WebRTC signaling handlers - client sends answer
  socket.on("webrtc_answer", async ({ tabId, answer }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (page && answer) {
      await page.evaluate((answer) => {
        window.__pc && window.__pc.setRemoteDescription(answer);
      }, answer);
    }
  });

  socket.on("webrtc_ice_candidate", async ({ tabId, candidate }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (page && candidate) {
      await page.evaluate((candidate) => {
        window.__pc && window.__pc.addIceCandidate(candidate);
      }, candidate);
    }
  });

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
          }
        }
      });

      // Remove cursor ownership for disconnected socket
      Object.keys(browserInstance.cursorState || {}).forEach(tabId => {
        if (browserInstance.cursorState[tabId]?.socketId === socket.id) {
          delete browserInstance.cursorState[tabId];
        }
      });

      // Cleanup all WebRTC connections for this socket
      if (browserInstance.webrtcConnections[socket.id]) {
        Object.keys(browserInstance.webrtcConnections[socket.id]).forEach(tabId => {
          cleanupWebRTC(socket.id, tabId, browserInstance);
        });
        delete browserInstance.webrtcConnections[socket.id];
      }
    }

    // Remove socket from browser map
    delete socketBrowserMap[socket.id];

    console.log("Client disconnected", socket.id);
  });
});

(async () => {
  // Initialize chromium reference (browsers will be initialized on-demand)
  await initChromium();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
    console.log("Available browser codes:", browserList.map(b => `${b.code} (${b.name})`).join(", "));
  });
})();
