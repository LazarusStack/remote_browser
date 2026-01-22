// Socket connection hook

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

export function useSocket(serverUrl) {
  const socketRef = useRef(null);

  useEffect(() => {
    const url = serverUrl || import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
    const socket = io(url);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serverUrl]);

  return socketRef;
}
