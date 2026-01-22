// Cookie management hook

import { useState, useEffect } from "react";

export function useCookies(socketRef) {
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [cookieJson, setCookieJson] = useState("");
  const [cookieStatus, setCookieStatus] = useState({ type: null, message: "" });

  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;

    socket.on("cookies_set", ({ success, count, error }) => {
      if (success) {
        setCookieStatus({ type: "success", message: `Successfully imported ${count} cookies!` });
        setTimeout(() => {
          setCookieStatus({ type: null, message: "" });
          setShowCookieModal(false);
          setCookieJson("");
        }, 2000);
      } else {
        setCookieStatus({ type: "error", message: error || "Failed to import cookies" });
      }
    });

    return () => {
      socket.off("cookies_set");
    };
  }, [socketRef]);

  const handleImportCookies = () => {
    if (!cookieJson.trim() || !socketRef.current) return;
    
    try {
      const cookies = JSON.parse(cookieJson);
      if (!Array.isArray(cookies)) {
        setCookieStatus({ type: "error", message: "Cookies must be an array" });
        return;
      }
      
      setCookieStatus({ type: null, message: "" });
      socketRef.current.emit("set_cookies", { cookies });
    } catch (error) {
      setCookieStatus({ type: "error", message: `Invalid JSON: ${error.message}` });
    }
  };

  return {
    showCookieModal,
    setShowCookieModal,
    cookieJson,
    setCookieJson,
    cookieStatus,
    setCookieStatus,
    handleImportCookies
  };
}
