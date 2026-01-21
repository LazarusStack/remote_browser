import { useEffect, useRef } from 'react';

export default function BrowserViewport({
  activeTab,
  screenshot,
  isLoading,
  viewportRef,
  scaleRef,
  handleViewportClick,
  handleViewportMouseMove,
  handleViewportWheel,
  handleKeyDown
}) {
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
          if (viewportRef.current) {
            viewportRef.current.style.transform = `scale(${scale})`;
            viewportRef.current.style.width = `${img.width}px`;
            viewportRef.current.style.height = `${img.height}px`;
          }
        };
        img.src = screenshot;
      }
    }
  }, [screenshot, viewportRef, scaleRef]);

  // Focus viewport when active tab changes
  useEffect(() => {
    if (activeTab && viewportRef.current) {
      viewportRef.current.focus();
    }
  }, [activeTab, viewportRef]);

  if (!activeTab) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-400">
          <p className="text-xl mb-4">No active tab</p>
          <p className="text-sm">Enter a URL above to open a new tab</p>
        </div>
      </div>
    );
  }

  return (
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
  );
}
