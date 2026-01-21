import { useState, useRef, useEffect } from "react";
import { useSocket } from "./hooks/useSocket";
import { useWebRTC } from "./hooks/useWebRTC";
import { useOffsets } from "./hooks/useOffsets";
import { normalizeUrl } from "./utils/urlUtils";
import { createViewportHandlers } from "./handlers/viewportHandlers";
import AuthScreen from "./components/AuthScreen";
import BrowserChrome from "./components/BrowserChrome";
import BrowserViewport from "./components/BrowserViewport";
import ControlsPanel from "./components/ControlsPanel";
import CookieModal from "./components/CookieModal";

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
  const [showOffsetControls, setShowOffsetControls] = useState(false);
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [cookieJson, setCookieJson] = useState("");
  const [cookieStatus, setCookieStatus] = useState({ type: null, message: "" });

  const viewportRef = useRef(null);
  const scaleRef = useRef(1);
  const latestScreenshotRef = useRef(null);
  const screenshotFrameRef = useRef(null);

  // Custom hooks
  const { offsetX, offsetY, setOffsetX, setOffsetY } = useOffsets();
  const {
    setupWebRTCForTab,
    cleanupWebRTCForTab,
    cleanupAllWebRTC,
    handleWebRTCOffer,
    handleWebRTCIceCandidate,
    peerConnectionsRef
  } = useWebRTC();

  // Create socket ref first (will be set by useSocket)
  const socketRef = useRef(null);

  // Setup WebRTC wrapper with proper dependencies
  const setupWebRTCWrapper = (tabId) => {
    setupWebRTCForTab(
      tabId,
      socketRef,
      setScreenshot,
      setIsLoading,
      setActiveTab,
      latestScreenshotRef,
      screenshotFrameRef
    );
  };

  // Initialize socket connection
  useSocket({
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
    setupWebRTCWrapper,
    cleanupWebRTCForTab,
    handleWebRTCOffer: (tabId, offer) => handleWebRTCOffer(tabId, offer, socketRef),
    handleWebRTCIceCandidate,
    latestScreenshotRef,
    screenshotFrameRef,
    setCookieStatus,
    setShowCookieModal,
    setCookieJson,
    peerConnectionsRef,
    socketRef
  });

  // Viewport handlers
  const { handleViewportClick, handleViewportMouseMove, handleViewportWheel, handleKeyDown } =
    createViewportHandlers(activeTab, viewportRef, scaleRef, offsetX, offsetY, socketRef);

  // Tab operations
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
    socketRef.current.emit("switch_tab", { tabId });
  };

  const closeTab = (tabId) => {
    if (!socketRef.current) return;
    socketRef.current.emit("close_tab", { tabId });
  };

  const handleNavigate = () => {
    if (!activeTab || !url || !socketRef.current) return;
    setIsLoading(true);
    const normalizedUrl = normalizeUrl(url);
    socketRef.current.emit("navigate", { tabId: activeTab, url: normalizedUrl });
    setUrl("");
  };

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

  // Update currentUrl when activeTab changes
  useEffect(() => {
    if (screenshotFrameRef.current) {
      cancelAnimationFrame(screenshotFrameRef.current);
      screenshotFrameRef.current = null;
    }

    const prevTab = latestScreenshotRef.current?.tabId;
    if (prevTab && prevTab !== activeTab) {
      if (latestScreenshotRef.current?.blobUrl) {
        URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
      }
      latestScreenshotRef.current = null;
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAllWebRTC();
      if (screenshotFrameRef.current) {
        cancelAnimationFrame(screenshotFrameRef.current);
      }
      if (latestScreenshotRef.current?.blobUrl) {
        URL.revokeObjectURL(latestScreenshotRef.current.blobUrl);
      }
    };
  }, []);

  // Show authentication screen if not authenticated
  if (!isAuthenticated) {
    return (
      <AuthScreen
        browserCode={browserCode}
        setBrowserCode={setBrowserCode}
        authError={authError}
        isLoading={isLoading}
        handleConnectBrowser={handleConnectBrowser}
      />
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
      <BrowserChrome
        isFullscreen={isFullscreen}
        tabs={tabs}
        activeTab={activeTab}
        switchTab={switchTab}
        closeTab={closeTab}
        setActiveTab={setActiveTab}
        setUrl={setUrl}
        url={url}
        currentUrl={currentUrl}
        handleNavigate={handleNavigate}
        openTab={openTab}
      />

      {/* Controls Panel */}
      <ControlsPanel
        showOffsetControls={showOffsetControls}
        setShowOffsetControls={setShowOffsetControls}
        offsetX={offsetX}
        offsetY={offsetY}
        setOffsetX={setOffsetX}
        setOffsetY={setOffsetY}
        showCookieModal={showCookieModal}
        setShowCookieModal={setShowCookieModal}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
      />

      {/* Browser Viewport */}
      <div className={`flex-1 overflow-hidden bg-gray-800 relative w-full h-full ${browserInfo ? 'mt-8' : ''}`}>
        <BrowserViewport
          activeTab={activeTab}
          screenshot={screenshot}
          isLoading={isLoading}
          viewportRef={viewportRef}
          scaleRef={scaleRef}
          handleViewportClick={handleViewportClick}
          handleViewportMouseMove={handleViewportMouseMove}
          handleViewportWheel={handleViewportWheel}
          handleKeyDown={handleKeyDown}
        />
      </div>

      {/* Cookie Import Modal */}
      <CookieModal
        showCookieModal={showCookieModal}
        setShowCookieModal={setShowCookieModal}
        cookieJson={cookieJson}
        setCookieJson={setCookieJson}
        cookieStatus={cookieStatus}
        setCookieStatus={setCookieStatus}
        handleImportCookies={handleImportCookies}
      />
    </div>
  );
}
