import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export const useSocket = ({
  setIsAuthenticated,
  setBrowserInfo,
  setAuthError,
  setIsLoading,
  setTabs,
  setActiveTab,
  setCurrentUrl,
  setScreenshot,
  setUrl,
  tabs,
  setupWebRTCForTab,
  cleanupWebRTCForTab,
  handleWebRTCOffer,
  handleWebRTCIceCandidate,
  latestScreenshotRef,
  screenshotFrameRef,
  setCookieStatus,
  setShowCookieModal,
  setCookieJson,
  peerConnectionsRef,
  socketRef
}) => {
  useEffect(() => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:3000";
    const socket = io(serverUrl);
    if (socketRef) {
      socketRef.current = socket;
    }

    socket.on("connect", () => {
      console.log("Connected to server");
    });

    socket.on("browser_connected", ({ browserId, name, code }) => {
      console.log("Connected to browser:", name);
      setIsAuthenticated(true);
      setBrowserInfo({ browserId, name, code });
      setAuthError("");
      setIsLoading(false);
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

    socket.on("error", ({ message }) => {
      console.error("Server error:", message);
      setAuthError(message);
      setIsLoading(false);
    });

    socket.on("tabs_list", (tabs) => {
      setTabs(tabs);
    });

    socket.on("tab_opened", ({ tabId, url }) => {
      setActiveTab(tabId);
      setCurrentUrl(url);
      socket.emit("list_tabs");
      setupWebRTCForTab(tabId);
    });

    socket.on("tab_closed", ({ tabId }) => {
      setActiveTab((currentActiveTab) => {
        if (currentActiveTab === tabId) {
          return null;
        }
        return currentActiveTab;
      });
      cleanupWebRTCForTab(tabId);
      socket.emit("list_tabs");
    });

    socket.on("tab_switched", ({ tabId }) => {
      setActiveTab(tabId);
      const tab = tabs.find(t => t.tabId === tabId);
      if (tab) {
        setUrl(tab.url);
      }
      setupWebRTCForTab(tabId);
    });

    // Handle WebRTC offer from server
    socket.on("webrtc_offer", async ({ tabId, offer }) => {
      if (handleWebRTCOffer) {
        handleWebRTCOffer(tabId, offer, socketRef);
      } else {
        // Fallback: handle directly if hook not provided
        try {
          let pc = peerConnectionsRef?.current?.[tabId];
          if (!pc) {
            // Setup will be called separately
            return;
          }
          if (pc && offer) {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socketRef.current.emit("webrtc_answer", {
              tabId,
              answer: pc.localDescription
            });
          }
        } catch (error) {
          console.error("Error handling WebRTC offer:", error);
        }
      }
    });

    // Handle WebRTC ICE candidate from server
    socket.on("webrtc_ice_candidate", async ({ tabId, candidate }) => {
      if (handleWebRTCIceCandidate) {
        handleWebRTCIceCandidate(tabId, candidate);
      } else {
        // Fallback: handle directly if hook not provided
        try {
          const pc = peerConnectionsRef?.current?.[tabId];
          if (pc && candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    });

    // Handle binary screenshot data
    socket.on("screenshot_binary", ({ tabId, image }) => {
      setActiveTab((currentActiveTab) => {
        if (tabId === currentActiveTab && image) {
          const base64 = btoa(
            new Uint8Array(image).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          const dataUrl = `data:image/jpeg;base64,${base64}`;

          latestScreenshotRef.current = {
            tabId,
            image: dataUrl,
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
        }
        return currentActiveTab;
      });
    });

    // Fallback: handle base64 screenshot
    socket.on("screenshot", ({ tabId, image }) => {
      console.log("screenshot", tabId);
      setActiveTab((currentActiveTab) => {
        if (tabId === currentActiveTab) {
          latestScreenshotRef.current = {
            tabId,
            image: `data:image/jpeg;base64,${image}`,
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
      setTabs(prev => prev.map(tab =>
        tab.tabId === tabId ? { ...tab, url } : tab
      ));
    });

    return () => {
      socket.disconnect();
      if (socketRef) {
        socketRef.current = null;
      }
      if (screenshotFrameRef.current) {
        cancelAnimationFrame(screenshotFrameRef.current);
      }
      if (latestScreenshotRef.current?.blobUrl) {
        URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
      }
    };
  }, []);

  // Return the socket ref (should be passed from parent)
  return socketRef;
};
