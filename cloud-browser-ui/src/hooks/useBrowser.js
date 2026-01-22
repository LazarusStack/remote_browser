// Browser state and authentication hook

import { useState, useEffect } from "react";

export function useBrowser(socketRef) {
  const [browserCode, setBrowserCode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [browserInfo, setBrowserInfo] = useState(null);
  const [authError, setAuthError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;

    socket.on("browser_connected", ({ browserId, name, code }) => {
      console.log("Connected to browser:", name);
      setIsAuthenticated(true);
      setBrowserInfo({ browserId, name, code });
      setAuthError("");
      setIsLoading(false);
      // Now we can list tabs
      socket.emit("list_tabs");
    });

    socket.on("browser_auth_error", ({ message }) => {
      setAuthError(message);
      setIsAuthenticated(false);
      setBrowserInfo(null);
      setIsLoading(false);
    });

    return () => {
      socket.off("browser_connected");
      socket.off("browser_auth_error");
    };
  }, [socketRef]);

  const connectBrowser = () => {
    if (!browserCode.trim() || !socketRef.current) return;
    setAuthError("");
    setIsLoading(true);
    socketRef.current.emit("connect_browser", { code: browserCode.trim() });
  };

  return {
    browserCode,
    setBrowserCode,
    isAuthenticated,
    browserInfo,
    authError,
    isLoading,
    connectBrowser
  };
}
