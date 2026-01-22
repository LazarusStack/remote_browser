// WebSocket client hook with reconnection and event emulation

import { useEffect, useRef } from "react";

export function useWebSocket(serverUrl) {
  const wsRef = useRef(null);
  const listenersRef = useRef(new Map()); // event -> Set of callbacks
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 1000;
  const maxReconnectDelay = 5000;

  const emit = (event, data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: event, data }));
    }
  };

  const on = (event, callback) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event).add(callback);
  };

  const off = (event, callback) => {
    if (listenersRef.current.has(event)) {
      listenersRef.current.get(event).delete(callback);
    }
  };

  const connect = () => {
    const url = serverUrl || import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
    // Convert HTTP URL to WebSocket URL
    let wsUrl;
    if (url.startsWith('http://')) {
      wsUrl = url.replace('http://', 'ws://');
    } else if (url.startsWith('https://')) {
      wsUrl = url.replace('https://', 'wss://');
    } else {
      wsUrl = `ws://${url}`;
    }
    
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.binaryType = 'arraybuffer'; // Important for binary frames

      ws.onopen = () => {
        console.log("WebSocket connected");
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Binary message - parse fixed header format (faster than JSON)
          try {
            const buffer = new Uint8Array(event.data);
            const dataView = new DataView(buffer.buffer);
            
            // Fixed header format: [4 bytes payload size][4 bytes tabId hash][4 bytes frameId][8 bytes timestamp]
            const HEADER_SIZE = 20;
            const payloadSize = dataView.getUint32(0, false);  // big-endian
            const tabIdHash = dataView.getUint32(4, false);
            const frameId = dataView.getUint32(8, false);
            const timestamp = Number(dataView.getBigUint64(12, false)); // Convert BigInt to Number
            
            // Extract binary image data (rest of the buffer after header)
            const binaryData = buffer.slice(HEADER_SIZE);
            
            // Convert tabId hash back to string format (for compatibility)
            // Note: This is a simple conversion - you may want to maintain a mapping
            const tabId = `tab_${tabIdHash}`;
            
            // Trigger screenshot_binary event with parsed data
            if (listenersRef.current.has('screenshot_binary')) {
              const callbacks = listenersRef.current.get('screenshot_binary');
              callbacks.forEach(callback => {
                callback({
                  tabId,
                  image: binaryData.buffer, // Pass ArrayBuffer
                  frameId,
                  timestamp,
                  compressed: false // No compression for JPEG
                });
              });
            }
          } catch (error) {
            console.error("Error parsing binary frame:", error);
          }
        } else {
          // JSON message
          try {
            const { type, data } = JSON.parse(event.data);
            
            // Trigger event listeners
            if (listenersRef.current.has(type)) {
              const callbacks = listenersRef.current.get(type);
              callbacks.forEach(callback => {
                callback(data);
              });
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        
        // Attempt reconnection
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(
            reconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
            maxReconnectDelay
          );
          
          reconnectAttemptsRef.current++;
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          console.error("Max reconnection attempts reached");
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Error creating WebSocket:", error);
    }
  };

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      listenersRef.current.clear();
    };
  }, [serverUrl]);

  // Create event emitter-like interface (reactive)
  const socketRef = useRef({
    emit,
    on,
    off,
    get connected() {
      return wsRef.current?.readyState === WebSocket.OPEN;
    },
    disconnect: () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    }
  });

  // Update socket ref when connection state changes
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render by updating a dummy property
      socketRef.current._update = Date.now();
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return socketRef;
}
