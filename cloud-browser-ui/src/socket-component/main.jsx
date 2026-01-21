import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

export default function Main() {
  const [browserCode, setBrowserCode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [browserInfo, setBrowserInfo] = useState(null);
  const [authError, setAuthError] = useState("");
  const [url, setUrl] = useState("");
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [currentUrl, setCurrentUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [showOffsetControls, setShowOffsetControls] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [cookieJson, setCookieJson] = useState("");
  const [cookieStatus, setCookieStatus] = useState({ type: null, message: "" });
  const viewportRef = useRef(null);
  const scaleRef = useRef(1);
  const socketRef = useRef(null);
  const latestScreenshotRef = useRef(null);
  const screenshotFrameRef = useRef(null);
  const dataChannelsRef = useRef({}); // tabId -> DataChannel
  const peerConnectionsRef = useRef({}); // tabId -> RTCPeerConnection

  // Setup WebRTC for a tab
  const setupWebRTCForTab = (tabId) => {
    if (peerConnectionsRef.current[tabId]) {
      return; // Already set up
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      // Handle incoming data channel (server creates it)
      pc.ondatachannel = (event) => {
        const dataChannel = event.channel;
        dataChannel.binaryType = 'arraybuffer';

        dataChannel.onopen = () => {
          console.log(`WebRTC DataChannel opened for tab ${tabId}`);
          dataChannelsRef.current[tabId] = dataChannel;
        };

        dataChannel.onmessage = (event) => {
          // Receive binary screenshot data
          if (event.data instanceof ArrayBuffer) {
            // Use Blob URL for better performance (avoids base64 conversion overhead)
            // This is critical - the previous base64 conversion was blocking the main thread
            const blob = new Blob([event.data], { type: 'image/jpeg' });
            const dataUrl = URL.createObjectURL(blob);

            setActiveTab((currentActiveTab) => {
              if (tabId === currentActiveTab) {
                // Clean up old blob URL to prevent memory leaks
                if (latestScreenshotRef.current?.blobUrl) {
                  URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
                }

                latestScreenshotRef.current = {
                  tabId,
                  image: dataUrl,
                  blobUrl: dataUrl, // Store for cleanup
                  timestamp: Date.now()
                };

                if (screenshotFrameRef.current) {
                  cancelAnimationFrame(screenshotFrameRef.current);
                }

                screenshotFrameRef.current = requestAnimationFrame(() => {
                  if (latestScreenshotRef.current && latestScreenshotRef.current.tabId === tabId) {
                    setScreenshot(latestScreenshotRef.current.image);
                    setIsLoading(false);
                    screenshotFrameRef.current = null;
                  }
                });
              } else {
                // If not active tab, revoking immediately would be wrong if we wanted to cache it, 
                // but for now we just drop it to save memory.
                URL.revokeObjectURL(dataUrl);
              }
              return currentActiveTab;
            });
          }
        };

        dataChannel.onerror = (error) => {
          console.error(`WebRTC DataChannel error for tab ${tabId}:`, error);
        };

        dataChannel.onclose = () => {
          console.log(`WebRTC DataChannel closed for tab ${tabId}`);
          delete dataChannelsRef.current[tabId];
        };
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('webrtc_ice_candidate', {
            tabId,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`WebRTC connection state for tab ${tabId}:`, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          cleanupWebRTCForTab(tabId);
        }
      };

      peerConnectionsRef.current[tabId] = pc;
    } catch (error) {
      console.error("Error setting up WebRTC:", error);
    }
  };

  const cleanupWebRTCForTab = (tabId) => {
    if (peerConnectionsRef.current[tabId]) {
      peerConnectionsRef.current[tabId].close();
      delete peerConnectionsRef.current[tabId];
    }
    delete dataChannelsRef.current[tabId];
  };

  // Initialize socket connection once
  useEffect(() => {
    // Use environment variable or fallback to localhost for development
    const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
    const socket = io(serverUrl);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server");
      // Don't list tabs until authenticated
    });

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

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
    });

    socket.on("tabs_list", (tabs) => {
      setTabs(tabs);
    });

    socket.on("tab_opened", ({ tabId, url }) => {
      setActiveTab(tabId);
      setCurrentUrl(url);
      socket.emit("list_tabs");
      // Setup WebRTC for the new tab
      setupWebRTCForTab(tabId);
    });

    socket.on("tab_closed", ({ tabId }) => {
      setActiveTab((currentActiveTab) => {
        if (currentActiveTab === tabId) {
          return null;
        }
        return currentActiveTab;
      });
      // Cleanup WebRTC for closed tab
      cleanupWebRTCForTab(tabId);
      socket.emit("list_tabs");
    });

    socket.on("tab_switched", ({ tabId }) => {
      setActiveTab(tabId);
      const tab = tabs.find(t => t.tabId === tabId);
      if (tab) {
        setUrl(tab.url);
      }
      // Setup WebRTC for the switched tab
      setupWebRTCForTab(tabId);
    });

    // Handle WebRTC offer from server
    socket.on("webrtc_offer", async ({ tabId, offer }) => {
      try {
        let pc = peerConnectionsRef.current[tabId];
        if (!pc) {
          setupWebRTCForTab(tabId);
          pc = peerConnectionsRef.current[tabId];
        }

        if (pc && offer) {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("webrtc_answer", {
            tabId,
            answer: pc.localDescription
          });
        }
      } catch (error) {
        console.error("Error handling WebRTC offer:", error);
      }
    });

    // Handle WebRTC ICE candidate from server
    socket.on("webrtc_ice_candidate", async ({ tabId, candidate }) => {
      try {
        const pc = peerConnectionsRef.current[tabId];
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    });

    // Handle binary screenshot data (more efficient)
    socket.on("screenshot_binary", ({ tabId, image }) => {
      setActiveTab((currentActiveTab) => {
        if (tabId === currentActiveTab && image) {
          // Convert binary to base64 data URL
          const base64 = btoa(
            new Uint8Array(image).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          const dataUrl = `data:image/jpeg;base64,${base64}`;

          // UDP-like behavior: only keep the latest frame
          latestScreenshotRef.current = {
            tabId,
            image: dataUrl,
            timestamp: Date.now()
          };

          // Cancel any pending frame update
          if (screenshotFrameRef.current) {
            cancelAnimationFrame(screenshotFrameRef.current);
          }

          // Schedule update for next frame (only latest will be rendered)
          screenshotFrameRef.current = requestAnimationFrame(() => {
            if (latestScreenshotRef.current && latestScreenshotRef.current.tabId === tabId) {
              setScreenshot(latestScreenshotRef.current.image);
              setIsLoading(false);
              screenshotFrameRef.current = null;
            }
          });
        }
        return currentActiveTab;
      });
    });

    // Fallback: handle base64 screenshot (for compatibility)
    socket.on("screenshot", ({ tabId, image }) => {
      console.log("screenshot", tabId);
      setActiveTab((currentActiveTab) => {
        if (tabId === currentActiveTab) {
          // UDP-like behavior: only keep the latest frame
          latestScreenshotRef.current = {
            tabId,
            image: `data:image/jpeg;base64,${image}`,
            timestamp: Date.now()
          };

          // Cancel any pending frame update
          if (screenshotFrameRef.current) {
            cancelAnimationFrame(screenshotFrameRef.current);
          }

          // Schedule update for next frame (only latest will be rendered)
          screenshotFrameRef.current = requestAnimationFrame(() => {
            if (latestScreenshotRef.current && latestScreenshotRef.current.tabId === tabId) {
              setScreenshot(latestScreenshotRef.current.image);
              setIsLoading(false);
              screenshotFrameRef.current = null;
            }
          });
        }
        return currentActiveTab;
      });
    });

    socket.on("url_changed", ({ tabId, url }) => {
      setActiveTab((currentActiveTab) => {
        if (tabId === currentActiveTab) {
          setCurrentUrl(url);
        }
        return currentActiveTab;
      });
      // Update tabs list
      setTabs(prev => prev.map(tab =>
        tab.tabId === tabId ? { ...tab, url } : tab
      ));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      // Cleanup animation frame
      if (screenshotFrameRef.current) {
        cancelAnimationFrame(screenshotFrameRef.current);
      }
      // Cleanup blob URLs
      if (latestScreenshotRef.current?.blobUrl) {
        URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
      }
      // Cleanup all WebRTC connections
      Object.keys(peerConnectionsRef.current).forEach(tabId => {
        cleanupWebRTCForTab(tabId);
      });
    };
  }, []); // Only run once on mount

  // Load offsets from localStorage on mount
  useEffect(() => {
    const STORAGE_KEY = 'browser_offset_config';
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const config = JSON.parse(saved);
        setOffsetX(config.x || 0);
        setOffsetY(config.y || 0);
      } catch (e) {
        console.error('Failed to load offset config:', e);
      }
    }
  }, []);

  // Listen for offset updates from offset-config app
  useEffect(() => {
    const STORAGE_KEY = 'browser_offset_config';

    // Listen for postMessage from offset-config app
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'OFFSET_UPDATE') {
        setOffsetX(event.data.x || 0);
        setOffsetY(event.data.y || 0);
      }
    };

    // Listen for storage changes (when offset-config saves)
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const config = JSON.parse(e.newValue);
          setOffsetX(config.x || 0);
          setOffsetY(config.y || 0);
        } catch (err) {
          console.error('Failed to parse offset config:', err);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorageChange);

    // Also poll localStorage periodically as a fallback
    const interval = setInterval(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const config = JSON.parse(saved);
          if (config.x !== offsetX || config.y !== offsetY) {
            setOffsetX(config.x || 0);
            setOffsetY(config.y || 0);
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }, 500);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [offsetX, offsetY]);

  // Update currentUrl when activeTab changes
  useEffect(() => {
    // Cancel any pending screenshot updates when tab changes
    if (screenshotFrameRef.current) {
      cancelAnimationFrame(screenshotFrameRef.current);
      screenshotFrameRef.current = null;
    }

    // Only clear screenshot if switching to a different tab (not just updating)
    // Don't clear if we're just updating tabs list
    const prevTab = latestScreenshotRef.current?.tabId;
    if (prevTab && prevTab !== activeTab) {
      // Clean up old blob URL when switching tabs
      if (latestScreenshotRef.current?.blobUrl) {
        URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
      }
      latestScreenshotRef.current = null;
      // Keep screenshot visible until new one arrives (don't clear immediately)
    }

    if (activeTab) {
      const tab = tabs.find(t => t.tabId === activeTab);
      if (tab) setCurrentUrl(tab.url);
    } else {
      setCurrentUrl("");
      setScreenshot(null);
      latestScreenshotRef.current = null;
    }
  }, [activeTab, tabs]);

  // Normalize URL - add protocol if missing, or convert to Google search
  const normalizeUrl = (input) => {
    if (!input || !input.trim()) return input;

    const trimmed = input.trim();

    // Check if it's already a valid URL with protocol
    try {
      const url = new URL(trimmed);
      return url.href;
    } catch (e) {
      // Not a valid URL with protocol
    }

    // Check if it looks like a domain (contains dots or localhost, and no spaces)
    const hasNoSpaces = !trimmed.includes(' ');
    const hasDot = trimmed.includes('.');
    const isLocalhost = trimmed.toLowerCase().startsWith('localhost');
    const hasColonPort = /:\d+/.test(trimmed); // e.g., localhost:3000

    // Simple check: if it has a dot or is localhost, and no spaces, treat as URL
    if ((hasDot || isLocalhost) && hasNoSpaces) {
      // It's likely a domain, add https://
      let normalized = trimmed;

      // Don't add www. for localhost or IP addresses
      const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed);
      const isLocal = isLocalhost || normalized.startsWith('127.') || normalized.startsWith('192.') || normalized.startsWith('10.');

      if (!isLocal && !normalized.startsWith('www.') && !normalized.includes('://')) {
        // Check if it's a common TLD that typically uses www
        const commonTlds = ['.com', '.org', '.net', '.edu', '.gov', '.io', '.co', '.dev', '.app'];
        const hasCommonTld = commonTlds.some(tld => normalized.toLowerCase().includes(tld));
        if (hasCommonTld) {
          normalized = 'www.' + normalized;
        }
      }

      // Use http:// for localhost, https:// for others
      const protocol = (isLocalhost || isIP || isLocal) ? 'http://' : 'https://';
      return `${protocol}${normalized}`;
    }

    // If it contains spaces or doesn't look like a URL, treat as Google search
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  };

  const openTab = () => {
    if (!url || !socketRef.current) return;
    setIsLoading(true);
    const normalizedUrl = normalizeUrl(url);
    socketRef.current.emit("open_tab", { url: normalizedUrl });
    setUrl("");
  };

  const switchTab = (tabId) => {
    if (!socketRef.current) return;
    setIsLoading(true);
    // Don't set activeTab here - let the server's tab_switched event handle it
    // This ensures the screenshot arrives after activeTab is set
    socketRef.current.emit("switch_tab", { tabId });
  };

  const closeTab = (tabId) => {
    if (!socketRef.current) return;
    socketRef.current.emit("close_tab", { tabId });
  };

  const handleViewportClick = (e) => {
    if (!activeTab || !viewportRef.current || !socketRef.current) return;

    const rect = viewportRef.current.getBoundingClientRect();
    const scale = scaleRef.current;
    // Account for the scaled and centered viewport
    // The viewport is centered, so we need to find the offset from the center
    const viewportWidth = 1920;
    const viewportHeight = 1080;
    const scaledWidth = viewportWidth * scale;
    const scaledHeight = viewportHeight * scale;

    // Calculate position relative to the viewport's top-left corner (before scaling)
    let x = (e.clientX - rect.left - (rect.width - scaledWidth) / 2) / scale;
    let y = (e.clientY - rect.top - (rect.height - scaledHeight) / 2) / scale;

    // Apply offsets
    x += offsetX;
    y += offsetY;

    // Clamp to viewport bounds
    const clampedX = Math.max(0, Math.min(viewportWidth, Math.round(x)));
    const clampedY = Math.max(0, Math.min(viewportHeight, Math.round(y)));

    socketRef.current.emit("mouse_click", {
      tabId: activeTab,
      x: clampedX,
      y: clampedY,
      button: e.button === 2 ? "right" : "left"
    });
  };

  const handleViewportMouseMove = (e) => {
    if (!activeTab || !viewportRef.current || !socketRef.current) return;

    const rect = viewportRef.current.getBoundingClientRect();
    const scale = scaleRef.current;
    // Account for the scaled and centered viewport
    const viewportWidth = 1920;
    const viewportHeight = 1080;
    const scaledWidth = viewportWidth * scale;
    const scaledHeight = viewportHeight * scale;

    // Calculate position relative to the viewport's top-left corner (before scaling)
    let x = (e.clientX - rect.left - (rect.width - scaledWidth) / 2) / scale;
    let y = (e.clientY - rect.top - (rect.height - scaledHeight) / 2) / scale;

    // Apply offsets
    x += offsetX;
    y += offsetY;

    // Clamp to viewport bounds
    const clampedX = Math.max(0, Math.min(viewportWidth, Math.round(x)));
    const clampedY = Math.max(0, Math.min(viewportHeight, Math.round(y)));

    socketRef.current.emit("mouse_move", {
      tabId: activeTab,
      x: clampedX,
      y: clampedY
    });
  };

  const handleViewportWheel = (e) => {
    if (!activeTab || !socketRef.current) return;
    e.preventDefault();

    socketRef.current.emit("scroll", {
      tabId: activeTab,
      deltaX: e.deltaX,
      deltaY: e.deltaY
    });
  };

  const handleKeyDown = (e) => {
    if (!activeTab || !socketRef.current) return;

    // Handle special keys
    const specialKeys = {
      // Navigation
      "Enter": "Enter",
      "Tab": "Tab",
      "Escape": "Escape",
      "Backspace": "Backspace",
      "Delete": "Delete",
      "Insert": "Insert",

      // Arrow keys
      "ArrowUp": "ArrowUp",
      "ArrowDown": "ArrowDown",
      "ArrowLeft": "ArrowLeft",
      "ArrowRight": "ArrowRight",

      // Modifier keys
      "Control": "Control",
      "Meta": "Meta", // Command on Mac
      "Alt": "Alt",
      "Shift": "Shift",

      // Function keys
      "F1": "F1",
      "F2": "F2",
      "F3": "F3",
      "F4": "F4",
      "F5": "F5",
      "F6": "F6",
      "F7": "F7",
      "F8": "F8",
      "F9": "F9",
      "F10": "F10",
      "F11": "F11",
      "F12": "F12",

      // Navigation keys
      "Home": "Home",
      "End": "End",
      "PageUp": "PageUp",
      "PageDown": "PageDown",

      // Other special keys
      "CapsLock": "CapsLock",
      "NumLock": "NumLock",
      "ScrollLock": "ScrollLock",
      "Pause": "Pause",
      "PrintScreen": "PrintScreen",
      "ContextMenu": "ContextMenu", // Right-click menu key

      // Media keys (if supported)
      "AudioVolumeUp": "AudioVolumeUp",
      "AudioVolumeDown": "AudioVolumeDown",
      "AudioVolumeMute": "AudioVolumeMute",
      "MediaPlayPause": "MediaPlayPause",
      "MediaStop": "MediaStop",
      "MediaTrackNext": "MediaTrackNext",
      "MediaTrackPrevious": "MediaTrackPrevious"
    };

    // Handle modifier key combinations (Ctrl+C, Cmd+V, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) {
      const modifiers = [];
      if (e.ctrlKey) modifiers.push("Control");
      if (e.metaKey) modifiers.push("Meta");
      if (e.altKey) modifiers.push("Alt");
      if (e.shiftKey) modifiers.push("Shift");

      // Get the actual key (without modifiers)
      const key = e.key;

      // Handle special key combinations
      if (specialKeys[key]) {
        e.preventDefault();
        // Send combination like "Control+c" or "Meta+v"
        const combination = modifiers.length > 0
          ? `${modifiers.join("+")}+${specialKeys[key]}`
          : specialKeys[key];
        socketRef.current.emit("keyboard_input", {
          tabId: activeTab,
          key: combination
        });
      } else if (key.length === 1) {
        // Regular character with modifiers (e.g., Ctrl+C)
        e.preventDefault();
        const combination = `${modifiers.join("+")}+${key}`;
        socketRef.current.emit("keyboard_input", {
          tabId: activeTab,
          key: combination
        });
      }
    } else if (specialKeys[e.key]) {
      // Standalone special key
      e.preventDefault();
      socketRef.current.emit("keyboard_input", {
        tabId: activeTab,
        key: specialKeys[e.key]
      });
    } else if (e.key.length === 1) {
      // Regular character input (no modifiers)
      socketRef.current.emit("keyboard_input", {
        tabId: activeTab,
        text: e.key
      });
    }
  };

  const handleNavigate = () => {
    if (!activeTab || !url || !socketRef.current) return;
    setIsLoading(true);
    const normalizedUrl = normalizeUrl(url);
    socketRef.current.emit("navigate", { tabId: activeTab, url: normalizedUrl });
    setUrl("");
  };

  // Calculate scale to fill viewport
  useEffect(() => {
    if (viewportRef.current && screenshot) {
      const container = viewportRef.current.parentElement;
      if (container) {
        const availableWidth = container.clientWidth;
        const availableHeight = container.clientHeight;
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(
            availableWidth / img.width,
            availableHeight / img.height
          );
          scaleRef.current = scale;
          // Force re-render to apply scale
          if (viewportRef.current) {
            viewportRef.current.style.transform = `scale(${scale})`;
            viewportRef.current.style.width = `${img.width}px`;
            viewportRef.current.style.height = `${img.height}px`;
          }
        };
        img.src = screenshot;
      }
    }
  }, [screenshot]);

  // Focus viewport when active tab changes
  useEffect(() => {
    if (activeTab && viewportRef.current) {
      viewportRef.current.focus();
    }
  }, [activeTab]);

  const handleConnectBrowser = () => {
    if (!browserCode.trim() || !socketRef.current) return;
    setAuthError("");
    setIsLoading(true);
    socketRef.current.emit("connect_browser", { code: browserCode.trim() });
  };

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

  // Show authentication screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-700">
          <h1 className="text-3xl font-bold mb-2 text-center bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Browser Access
          </h1>
          <p className="text-gray-400 text-sm text-center mb-6">
            Enter your browser access code to continue
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Browser Code
              </label>
              <input
                type="text"
                value={browserCode}
                onChange={(e) => setBrowserCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleConnectBrowser();
                  }
                }}
                placeholder="Enter code (e.g., ABC123)"
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white text-center text-lg font-mono focus:outline-none focus:border-blue-500"
                autoFocus
                maxLength={10}
              />
            </div>

            {authError && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm text-center">
                {authError}
              </div>
            )}

            <button
              onClick={handleConnectBrowser}
              disabled={!browserCode.trim() || isLoading}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-lg font-medium transition-all shadow-lg hover:shadow-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Connecting..." : "Connect to Browser"}
            </button>

            <div className="mt-6 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-400 leading-relaxed">
                💡 <strong>Note:</strong> Contact your administrator to get a browser access code.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white overflow-hidden relative">
      {/* Browser Info Bar */}
      {browserInfo && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-blue-600/90 backdrop-blur-sm px-4 py-2 text-center text-sm">
          Connected to: <span className="font-bold">{browserInfo.name}</span> (Code: {browserInfo.code})
        </div>
      )}

      {/* Browser Chrome - Overlay */}
      {!isFullscreen && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-gray-800/95 border-b border-gray-700 backdrop-blur-sm">
          <div className="px-4 py-3">
            {/* Tab Bar */}
            <div className="flex items-center gap-2 mb-3 overflow-x-auto">
              {tabs.map((tab) => (
                <div
                  key={tab.tabId}
                  onClick={() => {
                    switchTab(tab.tabId);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg min-w-[200px] max-w-[400px] truncate cursor-pointer ${activeTab === tab.tabId
                    ? "bg-gray-900 border-t border-x border-gray-700"
                    : "bg-gray-700 hover:bg-gray-600"
                    }`}
                >
                  <span className="text-xs truncate flex-1">{tab.url}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent tab switch when clicking close
                      closeTab(tab.tabId);
                    }}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={() => {
                  setActiveTab(null);
                  setUrl("https://google.com");
                  setTimeout(() => {
                    const input = document.querySelector('input[placeholder*="https"]');
                    if (input) input.focus();
                  }, 0);
                }}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                +
              </button>
            </div>

            {/* Address Bar */}
            <div className="flex gap-2 items-center">
              <div className="flex gap-2 flex-1">
                <button
                  onClick={() => activeTab && switchTab(activeTab)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                  disabled={!activeTab}
                >
                  ↻
                </button>
                <input
                  value={url || currentUrl}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (activeTab) {
                        handleNavigate();
                      } else {
                        openTab();
                      }
                    }
                  }}
                  placeholder="Enter URL or search"
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={activeTab ? handleNavigate : openTab}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                  disabled={!url && !activeTab}
                >
                  {activeTab ? "Go" : "Open"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls Panel */}
      <div className="absolute top-2 right-2 z-50 flex gap-2 items-center">
        {/* Offset Controls - Collapsible */}
        {showOffsetControls && (
          <div className="flex gap-2 items-center bg-gray-800/90 backdrop-blur-sm rounded px-3 py-2">
            <label className="text-xs text-gray-300">X:</label>
            <input
              type="number"
              value={offsetX}
              onChange={(e) => setOffsetX(parseInt(e.target.value) || 0)}
              className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
              step="1"
            />
            <label className="text-xs text-gray-300 ml-2">Y:</label>
            <input
              type="number"
              value={offsetY}
              onChange={(e) => setOffsetY(parseInt(e.target.value) || 0)}
              className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
              step="1"
            />
            <button
              onClick={() => {
                setOffsetX(0);
                setOffsetY(0);
              }}
              className="ml-2 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
              title="Reset offsets"
            >
              Reset
            </button>
          </div>
        )}
        {/* Cookie Import Button */}
        <button
          onClick={() => setShowCookieModal(true)}
          className="px-3 py-2 bg-gray-800/90 hover:bg-gray-700 rounded text-sm backdrop-blur-sm"
          title="Import cookies"
        >
          🍪
        </button>

        {/* Offset Toggle Button */}
        <button
          onClick={() => setShowOffsetControls(!showOffsetControls)}
          className="px-3 py-2 bg-gray-800/90 hover:bg-gray-700 rounded text-sm backdrop-blur-sm"
          title={showOffsetControls ? "Hide offset controls" : "Show offset controls"}
        >
          ⚙️
        </button>
        {/* Fullscreen Toggle Button */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="px-3 py-2 bg-gray-800/90 hover:bg-gray-700 rounded text-sm backdrop-blur-sm"
          title={isFullscreen ? "Show controls" : "Hide controls"}
        >
          {isFullscreen ? "☰" : "✕"}
        </button>
      </div>

      {/* Browser Viewport */}
      <div className={`flex-1 overflow-hidden bg-gray-800 relative w-full h-full ${browserInfo ? 'mt-8' : ''}`}>
        {activeTab ? (
          <div className="w-full h-full flex items-center justify-center relative">
            <div
              ref={viewportRef}
              className="bg-white overflow-visible cursor-pointer relative focus:outline-none"
              style={{
                transform: `scale(${scaleRef.current})`,
                transformOrigin: "center center"
              }}
              onClick={handleViewportClick}
              onMouseMove={handleViewportMouseMove}
              onWheel={handleViewportWheel}
              onContextMenu={(e) => {
                e.preventDefault();
                handleViewportClick(e);
              }}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              onMouseDown={(e) => {
                // Focus on click to enable keyboard input
                if (viewportRef.current) {
                  viewportRef.current.focus();
                }
              }}
            >
              {isLoading && !screenshot ? (
                <div className="w-[1920px] h-[1080px] flex items-center justify-center bg-gray-100">
                  <div className="text-gray-500">Loading...</div>
                </div>
              ) : screenshot ? (
                <img
                  src={screenshot}
                  alt="Browser viewport"
                  className="block"
                  draggable={false}
                />
              ) : (
                <div className="w-[1920px] h-[1080px] flex items-center justify-center bg-gray-100">
                  <div className="text-gray-500">No screenshot available</div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <p className="text-xl mb-4">No active tab</p>
              <p className="text-sm">Enter a URL above to open a new tab</p>
            </div>
          </div>
        )}
      </div>

      {/* Cookie Import Modal */}
      {showCookieModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Import Cookies</h2>
              <button
                onClick={() => {
                  setShowCookieModal(false);
                  setCookieJson("");
                  setCookieStatus({ type: null, message: "" });
                }}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex flex-col p-6">
              <p className="text-sm text-gray-400 mb-4">
                Paste your cookies JSON array here. Cookies will be applied to all tabs in this browser instance.
              </p>

              <textarea
                value={cookieJson}
                onChange={(e) => {
                  setCookieJson(e.target.value);
                  setCookieStatus({ type: null, message: "" });
                }}
                placeholder='[{"domain":".youtube.com","name":"LOGIN_INFO","value":"...","path":"/","secure":true,...}]'
                className="flex-1 w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-sm resize-none focus:outline-none focus:border-blue-500"
              />

              {cookieStatus.type && (
                <div
                  className={`mt-4 p-3 rounded-lg text-sm ${cookieStatus.type === "success"
                    ? "bg-green-900/30 border border-green-700 text-green-400"
                    : "bg-red-900/30 border border-red-700 text-red-400"
                    }`}
                >
                  {cookieStatus.message}
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleImportCookies}
                  className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                  disabled={!cookieJson.trim()}
                >
                  Import Cookies
                </button>
                <button
                  onClick={() => {
                    setShowCookieModal(false);
                    setCookieJson("");
                    setCookieStatus({ type: null, message: "" });
                  }}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
