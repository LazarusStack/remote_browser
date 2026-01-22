// Main server entry point - clean and modular

import express from "express";
import http from "http";
import { config, browserList } from "./config/index.js";
import { initChromium } from "./browser/browserManager.js";
import { initWebSocketServer } from "./websocket/wsServer.js";

const app = express();
const server = http.createServer(app);

// Browser instances storage: browserId -> { browser, context, pages, tabCounter, etc. }
const browserInstances = {}; // browserId -> browser instance data
const socketBrowserMap = {}; // connectionId -> browserId (which browser this connection is connected to)

// Initialize WebSocket server
const wss = initWebSocketServer(server, config, browserInstances, socketBrowserMap);

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
