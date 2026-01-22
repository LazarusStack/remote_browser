// Socket connection hook with optimized configuration

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

export function useSocket(serverUrl) {
  const socketRef = useRef(null);

  useEffect(() => {
    const url = serverUrl || import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
    
    // Optimize Socket.IO client for binary streaming (Google Meet style)
    const socket = io(url, {
      // Prefer WebSocket for lower latency and better binary support
      transports: ['websocket', 'polling'],
      // Upgrade to WebSocket immediately if available
      upgrade: true,
      // Enable reconnection for reliability
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      // Optimize for binary data
      forceNew: false,
      // Timeout settings
      timeout: 20000,
      // Enable compression (matches server)
      compression: true
    });
    
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server via", socket.io.engine.transport.name);
    });

    socket.on("disconnect", (reason) => {
      console.log("Disconnected from server:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("Connection error:", error.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serverUrl]);

  return socketRef;
}
