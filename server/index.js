// index.js
// Cloud browser with full mirroring and interaction support

import express from "express";
import http from "http";
import { Server } from "socket.io";
import wrtc from "@koush/wrtc";
const { RTCPeerConnection, RTCSessionDescription } = wrtc;

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
const webrtcConnections = {}; // socketId -> { tabId -> RTCPeerConnection }
const webrtcDataChannels = {}; // socketId -> { tabId -> RTCDataChannel }
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

// Setup WebRTC connection for a client viewing a tab
async function setupWebRTC(socket, tabId) {
  try {
    if (!webrtcConnections[socket.id]) {
      webrtcConnections[socket.id] = {};
    }
    if (!webrtcDataChannels[socket.id]) {
      webrtcDataChannels[socket.id] = {};
    }

    // Create or reuse peer connection for this tab
    let pc = webrtcConnections[socket.id][tabId];
    if (!pc) {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      // Create data channel for screenshot data
      const dataChannel = pc.createDataChannel('screenshots', {
        ordered: false, // UDP-like behavior
        maxRetransmits: 0 // Don't retransmit, drop old frames
      });

      dataChannel.binaryType = 'arraybuffer';
      
      dataChannel.onopen = () => {
        console.log(`WebRTC DataChannel opened for tab ${tabId}, socket ${socket.id}`);
      };

      dataChannel.onerror = (error) => {
        console.error(`WebRTC DataChannel error for tab ${tabId}:`, error);
      };

      dataChannel.onclose = () => {
        console.log(`WebRTC DataChannel closed for tab ${tabId}`);
        delete webrtcDataChannels[socket.id][tabId];
      };

      webrtcConnections[socket.id][tabId] = pc;
      webrtcDataChannels[socket.id][tabId] = dataChannel;

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc_ice_candidate', {
            tabId,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`WebRTC connection state for tab ${tabId}:`, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          cleanupWebRTC(socket.id, tabId);
        }
      };

      // Create offer and send to client
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_offer', {
        tabId,
        offer: pc.localDescription
      });
    }

    return webrtcDataChannels[socket.id][tabId];
  } catch (error) {
    console.error("Error setting up WebRTC:", error);
    return null;
  }
}

function cleanupWebRTC(socketId, tabId) {
  if (webrtcConnections[socketId] && webrtcConnections[socketId][tabId]) {
    webrtcConnections[socketId][tabId].close();
    delete webrtcConnections[socketId][tabId];
  }
  if (webrtcDataChannels[socketId] && webrtcDataChannels[socketId][tabId]) {
    delete webrtcDataChannels[socketId][tabId];
  }
}

async function startCDPScreencast(socket, tabId) {
  const page = pages[tabId];
  if (!page || page.isClosed()) return;

  // Add this socket to the viewers of this tab
  if (!tabViewers[tabId]) {
    tabViewers[tabId] = new Set();
  }
  tabViewers[tabId].add(socket.id);
  
  // Setup WebRTC for this client/tab
  await setupWebRTC(socket, tabId);

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
          // Convert base64 to Buffer for efficient binary transfer
          const imageBuffer = Buffer.from(data, 'base64');
          const viewers = tabViewers[tabId] || new Set();
          
          viewers.forEach(socketId => {
            // Try WebRTC DataChannel first (most efficient)
            const dataChannel = webrtcDataChannels[socketId]?.[tabId];
            if (dataChannel && dataChannel.readyState === 'open') {
              try {
                // Send binary data through WebRTC DataChannel
                dataChannel.send(imageBuffer);
              } catch (error) {
                // Fallback to Socket.IO if WebRTC fails
                const viewerSocket = io.sockets.sockets.get(socketId);
                if (viewerSocket) {
                  viewerSocket.emit("screenshot_binary", {
                    tabId,
                    image: imageBuffer
                  });
                }
              }
            } else {
              // Fallback to Socket.IO binary
              const viewerSocket = io.sockets.sockets.get(socketId);
              if (viewerSocket) {
                viewerSocket.emit("screenshot_binary", {
                  tabId,
                  image: imageBuffer
                });
                // Also send base64 for compatibility
                viewerSocket.emit("screenshot", {
                  tabId,
                  image: data
                });
              }
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
    
    // Cleanup WebRTC for this tab
    cleanupWebRTC(socket.id, tabId);
    
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

  // WebRTC signaling handlers - client sends answer
  socket.on("webrtc_answer", async ({ tabId, answer }) => {
    try {
      const pc = webrtcConnections[socket.id]?.[tabId];
      if (pc && answer) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`WebRTC answer received for tab ${tabId}`);
      }
    } catch (error) {
      console.error("Error handling WebRTC answer:", error);
    }
  });

  socket.on("webrtc_ice_candidate", async ({ tabId, candidate }) => {
    try {
      const pc = webrtcConnections[socket.id]?.[tabId];
      if (pc && candidate) {
        await pc.addIceCandidate(candidate);
      }
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
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
    
    // Cleanup all WebRTC connections for this socket
    if (webrtcConnections[socket.id]) {
      Object.keys(webrtcConnections[socket.id]).forEach(tabId => {
        cleanupWebRTC(socket.id, tabId);
      });
      delete webrtcConnections[socket.id];
    }
    if (webrtcDataChannels[socket.id]) {
      delete webrtcDataChannels[socket.id];
    }
    
    console.log("Client disconnected", socket.id);
  });
});

(async () => {
  await initBrowser();
  server.listen(3000, () => {
    console.log("Server running on port 3000");
  });
})();
