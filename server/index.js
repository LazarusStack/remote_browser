// Main server entry point - clean and modular

import express from "express";
import http from "http";
import { Server } from "socket.io";
import { config, browserList } from "./config/index.js";
import { initChromium } from "./browser/browserManager.js";
import { handleConnectBrowser } from "./handlers/authHandler.js";
import {
  handleOpenTab,
  handleListTabs,
  handleSwitchTab,
  handleCloseTab
} from "./handlers/tabHandlers.js";
import {
  handleMouseClick,
  handleMouseMove,
  handleKeyboardInput,
  handleScroll,
  handleNavigate
} from "./handlers/interactionHandlers.js";
import { handleSetCookies } from "./handlers/cookieHandler.js";
import { handleDisconnect } from "./handlers/disconnectHandler.js";

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with optimizations for binary streaming
const io = new Server(server, {
  cors: { 
    origin: config.allowedOrigins.includes("*") ? "*" : config.allowedOrigins,
    credentials: true
  },
  // Optimize for binary data transfer
  transports: ['websocket', 'polling'], // Prefer websocket, fallback to polling
  allowEIO3: true,
  // Enable compression for better performance
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3 // Balance between speed and compression
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Only compress if payload is > 1KB
    threshold: 1024
  },
  // Optimize ping/pong for lower latency
  pingTimeout: 60000,
  pingInterval: 25000,
  // Increase max HTTP buffer for large binary frames
  maxHttpBufferSize: 1e8 // 100MB
});

// Browser instances storage: browserId -> { browser, context, pages, tabCounter, etc. }
const browserInstances = {}; // browserId -> browser instance data
const socketBrowserMap = {}; // socketId -> browserId (which browser this socket is connected to)

// Socket.IO connection handler
io.on("connection", async (socket) => {
  console.log("Client connected", socket.id);

  // Authentication
  socket.on("connect_browser", async (data) => {
    await handleConnectBrowser(socket, data, socketBrowserMap, browserInstances);
  });

  // Tab management
  socket.on("open_tab", async (data) => {
    await handleOpenTab(socket, data, socketBrowserMap, browserInstances, io);
  });

  socket.on("list_tabs", async () => {
    handleListTabs(socket, socketBrowserMap, browserInstances);
  });

  socket.on("switch_tab", async (data) => {
    await handleSwitchTab(socket, data, socketBrowserMap, browserInstances, io);
  });

  socket.on("close_tab", async (data) => {
    await handleCloseTab(socket, data, socketBrowserMap, browserInstances, io);
  });

  // User interactions
  socket.on("mouse_click", async (data) => {
    await handleMouseClick(socket, data, socketBrowserMap, browserInstances);
  });

  socket.on("mouse_move", async (data) => {
    await handleMouseMove(socket, data, socketBrowserMap, browserInstances);
  });

  socket.on("keyboard_input", async (data) => {
    await handleKeyboardInput(socket, data, socketBrowserMap, browserInstances);
  });

  socket.on("scroll", async (data) => {
    await handleScroll(socket, data, socketBrowserMap, browserInstances);
  });

  socket.on("navigate", async (data) => {
    await handleNavigate(socket, data, socketBrowserMap, browserInstances);
  });

  // Cookie management
  socket.on("set_cookies", async (data) => {
    await handleSetCookies(socket, data, socketBrowserMap, browserInstances);
  });

  // Cleanup on disconnect
  socket.on("disconnect", async () => {
    await handleDisconnect(socket, socketBrowserMap, browserInstances);
  });
});

// Start server
(async () => {
  // Initialize chromium reference (browsers will be initialized on-demand)
  await initChromium();
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`Server running on port ${config.port}`);
    console.log(`Allowed origins: ${config.allowedOrigins.join(", ")}`);
    console.log("Available browser codes:", browserList.map(b => `${b.code} (${b.name})`).join(", "));
  });
})();
