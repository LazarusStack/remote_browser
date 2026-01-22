// Raw WebSocket server with message protocol

import { WebSocketServer } from 'ws';
import { handleConnectBrowser } from '../handlers/authHandler.js';
import {
  handleOpenTab,
  handleListTabs,
  handleSwitchTab,
  handleCloseTab
} from '../handlers/tabHandlers.js';
import {
  handleMouseClick,
  handleMouseMove,
  handleKeyboardInput,
  handleScroll,
  handleNavigate
} from '../handlers/interactionHandlers.js';
import { handleSetCookies } from '../handlers/cookieHandler.js';
import { handleDisconnect } from '../handlers/disconnectHandler.js';

// WebSocket connection storage
const wsConnections = new Map(); // ws -> { id, browserId, ... }

// Generate unique connection ID
let connectionCounter = 0;
function generateConnectionId() {
  return `ws_${++connectionCounter}_${Date.now()}`;
}

/**
 * Send JSON message to WebSocket client
 */
export function sendJSON(ws, type, data) {
  if (ws.readyState === 1) { // OPEN
    try {
      ws.send(JSON.stringify({ type, data }));
    } catch (error) {
      console.error("Error sending JSON message:", error.message);
    }
  }
}

/**
 * Send binary frame to WebSocket client
 * Returns true if sent successfully, false otherwise
 */
export function sendBinary(ws, buffer) {
  if (ws.readyState === 1) { // OPEN
    try {
      ws.send(buffer);
      return true;
    } catch (error) {
      console.error("Error sending binary frame:", error.message);
      return false;
    }
  }
  return false;
}

/**
 * Broadcast JSON message to all connections viewing a tab
 */
export function broadcastToTabViewers(tabViewers, type, data) {
  tabViewers.forEach(connectionId => {
    const ws = findWebSocketById(connectionId);
    if (ws) {
      sendJSON(ws, type, data);
    }
  });
}

/**
 * Broadcast binary frame to all connections viewing a tab
 */
export function broadcastBinaryToTabViewers(tabViewers, buffer) {
  tabViewers.forEach(connectionId => {
    const ws = findWebSocketById(connectionId);
    if (ws) {
      sendBinary(ws, buffer);
    }
  });
}

/**
 * Find WebSocket by connection ID
 */
export function findWebSocketById(connectionId) {
  for (const [ws, conn] of wsConnections.entries()) {
    if (conn.id === connectionId) {
      return ws;
    }
  }
  return null;
}

/**
 * Get WebSocket connection info
 */
export function getConnectionInfo(ws) {
  return wsConnections.get(ws);
}

/**
 * Set WebSocket connection info
 */
export function setConnectionInfo(ws, info) {
  wsConnections.set(ws, { ...wsConnections.get(ws), ...info });
}

/**
 * Create WebSocket adapter that provides emit/on/off interface for handlers
 */
function createWSAdapter(ws, connectionId) {
  return {
    id: connectionId,
    emit: (event, data) => {
      sendJSON(ws, event, data);
    },
    on: () => {}, // Not needed for handlers
    off: () => {}, // Not needed for handlers
    connected: ws.readyState === 1
  };
}

/**
 * Initialize WebSocket server
 */
export function initWebSocketServer(server, config, browserInstances, socketBrowserMap) {
  const wss = new WebSocketServer({ 
    server,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024
      },
      threshold: 1024
    }
  });

  wss.on('connection', (ws, req) => {
    const connectionId = generateConnectionId();
    const wsAdapter = createWSAdapter(ws, connectionId);
    
    wsConnections.set(ws, {
      id: connectionId,
      browserId: null,
      connected: true,
      adapter: wsAdapter
    });

    // Map connection ID to browser ID (for compatibility with existing code)
    socketBrowserMap[connectionId] = null;

    console.log("WebSocket client connected", connectionId);

    // Handle incoming messages
    ws.on('message', async (message, isBinary) => {
      try {
        if (isBinary) {
          // Binary messages are for future use (e.g., file uploads)
          console.warn("Received unexpected binary message");
          return;
        }

        // Parse JSON message
        const { type, data } = JSON.parse(message.toString());
        const conn = wsConnections.get(ws);
        
        if (!conn) {
          sendJSON(ws, 'error', { message: 'Connection not initialized' });
          return;
        }

        // Route message to appropriate handler (pass adapter instead of raw ws)
        switch (type) {
          case 'connect_browser':
            await handleConnectBrowser(wsAdapter, data, socketBrowserMap, browserInstances);
            break;
          
          case 'open_tab':
            await handleOpenTab(wsAdapter, data, socketBrowserMap, browserInstances, wss);
            break;
          
          case 'list_tabs':
            handleListTabs(wsAdapter, socketBrowserMap, browserInstances);
            break;
          
          case 'switch_tab':
            await handleSwitchTab(wsAdapter, data, socketBrowserMap, browserInstances, wss);
            break;
          
          case 'close_tab':
            await handleCloseTab(wsAdapter, data, socketBrowserMap, browserInstances, wss);
            break;
          
          case 'mouse_click':
            await handleMouseClick(wsAdapter, data, socketBrowserMap, browserInstances);
            break;
          
          case 'mouse_move':
            await handleMouseMove(wsAdapter, data, socketBrowserMap, browserInstances);
            break;
          
          case 'keyboard_input':
            await handleKeyboardInput(wsAdapter, data, socketBrowserMap, browserInstances);
            break;
          
          case 'scroll':
            await handleScroll(wsAdapter, data, socketBrowserMap, browserInstances);
            break;
          
          case 'navigate':
            await handleNavigate(wsAdapter, data, socketBrowserMap, browserInstances);
            break;
          
          case 'set_cookies':
            await handleSetCookies(wsAdapter, data, socketBrowserMap, browserInstances);
            break;
          
          default:
            sendJSON(ws, 'error', { message: `Unknown message type: ${type}` });
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
        sendJSON(ws, 'error', { message: error.message });
      }
    });

    // Handle connection close
    ws.on('close', async () => {
      const conn = wsConnections.get(ws);
      if (conn) {
        console.log("WebSocket client disconnected", conn.id);
        await handleDisconnect(wsAdapter, socketBrowserMap, browserInstances);
        delete socketBrowserMap[conn.id];
        wsConnections.delete(ws);
      }
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error("WebSocket error:", error.message);
    });

    // Send connection confirmation
    sendJSON(ws, 'connected', { connectionId });
  });

  return wss;
}
