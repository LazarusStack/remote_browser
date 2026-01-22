// Main component - clean and modular

import { useState } from "react";
import { useWebSocket as useSocket } from "../hooks/useWebSocket.js";
import { useBrowser } from "../hooks/useBrowser.js";
import { useTabs } from "../hooks/useTabs.js";
import { useScreenshot } from "../hooks/useScreenshot.js";
import { useViewport } from "../hooks/useViewport.js";
import { useCookies } from "../hooks/useCookies.js";
import { useOffsets } from "../hooks/useOffsets.js";
import { normalizeUrl } from "../utils/urlUtils.js";
import AuthScreen from "../components/AuthScreen.jsx";
import BrowserChrome from "../components/BrowserChrome.jsx";
import Viewport from "../components/Viewport.jsx";
import Controls from "../components/Controls.jsx";
import CookieModal from "../components/CookieModal.jsx";

export default function Main() {
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [showOffsetControls, setShowOffsetControls] = useState(false);

  // Initialize hooks
  const socketRef = useSocket();
  const { offsetX, setOffsetX, offsetY, setOffsetY } = useOffsets();
  const {
    browserCode,
    setBrowserCode,
    isAuthenticated,
    browserInfo,
    authError,
    isLoading,
    connectBrowser
  } = useBrowser(socketRef);
  
  const {
    tabs,
    activeTab,
    setActiveTab,
    url,
    setUrl,
    currentUrl,
    openTab,
    switchTab,
    closeTab
  } = useTabs(socketRef);
  
  const { screenshot, isLoading: screenshotLoading, setIsLoading } = useScreenshot(socketRef, activeTab);
  
  const {
    viewportRef,
    scaleRef,
    handleClick,
    handleMouseMove,
    handleKeyDown
  } = useViewport(socketRef, activeTab, offsetX, offsetY, screenshot);
  
  const {
    showCookieModal,
    setShowCookieModal,
    cookieJson,
    setCookieJson,
    cookieStatus,
    setCookieStatus,
    handleImportCookies
  } = useCookies(socketRef);

  // Navigation handler
  const handleNavigate = () => {
    if (!activeTab || !url || !socketRef.current) return;
    setIsLoading(true);
    const normalizedUrl = normalizeUrl(url);
    socketRef.current.emit("navigate", { tabId: activeTab, url: normalizedUrl });
    setUrl("");
  };

  // Tab operations
  const handleOpenTab = () => {
    if (!url || !socketRef.current) return;
    setIsLoading(true);
    const normalizedUrl = normalizeUrl(url);
    openTab(normalizedUrl);
  };

  const handleNewTab = () => {
    setActiveTab(null);
    setUrl("https://google.com");
    setTimeout(() => {
      const input = document.querySelector('input[placeholder*="https"]');
      if (input) input.focus();
    }, 0);
  };

  // Show authentication screen if not authenticated
  if (!isAuthenticated) {
    return (
      <AuthScreen
        browserCode={browserCode}
        setBrowserCode={setBrowserCode}
        authError={authError}
        isLoading={isLoading}
        onConnect={connectBrowser}
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
      {!isFullscreen && (
        <BrowserChrome
          tabs={tabs}
          activeTab={activeTab}
          url={url}
          currentUrl={currentUrl}
          setUrl={setUrl}
          onSwitchTab={switchTab}
          onCloseTab={closeTab}
          onOpenTab={handleOpenTab}
          onNavigate={handleNavigate}
          onNewTab={handleNewTab}
        />
      )}

      {/* Controls Panel */}
      <Controls
        showOffsetControls={showOffsetControls}
        setShowOffsetControls={setShowOffsetControls}
        offsetX={offsetX}
        offsetY={offsetY}
        setOffsetX={setOffsetX}
        setOffsetY={setOffsetY}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
        onShowCookieModal={() => setShowCookieModal(true)}
      />

      {/* Browser Viewport */}
      <div className={`flex-1 overflow-hidden bg-gray-800 relative w-full h-full ${browserInfo ? 'mt-8' : ''}`}>
        {activeTab ? (
          <Viewport
            activeTab={activeTab}
            screenshot={screenshot}
            isLoading={screenshotLoading}
            viewportRef={viewportRef}
            scaleRef={scaleRef}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onKeyDown={handleKeyDown}
          />
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
      <CookieModal
        show={showCookieModal}
        cookieJson={cookieJson}
        setCookieJson={setCookieJson}
        cookieStatus={cookieStatus}
        setCookieStatus={setCookieStatus}
        onClose={() => {
          setShowCookieModal(false);
          setCookieJson("");
          setCookieStatus({ type: null, message: "" });
        }}
        onImport={handleImportCookies}
      />
    </div>
  );
}
