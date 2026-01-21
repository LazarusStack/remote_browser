// index.js
// Cloud browser with full mirroring and interaction support

import express from "express";
import http from "http";
import { Server } from "socket.io";
import { initChromium } from "./browser/browserManager.js";
import { browserList } from "./config/browsers.js";
import { setupAuthHandlers } from "./handlers/authHandlers.js";
import { setupTabHandlers } from "./handlers/tabHandlers.js";
import { setupInteractionHandlers } from "./handlers/interactionHandlers.js";
import { setupCookieHandlers } from "./handlers/cookieHandlers.js";
import { setupWebRTCHandlers } from "./handlers/webrtcHandlers.js";
import { setupDisconnectHandler } from "./handlers/disconnectHandler.js";

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

io.on("connection", async (socket) => {
  console.log("Client connected", socket.id);

  // Setup all event handlers
  setupAuthHandlers(socket);
  setupTabHandlers(socket, io);
  setupInteractionHandlers(socket);
  setupCookieHandlers(socket);
  setupWebRTCHandlers(socket);
  setupDisconnectHandler(socket);
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
