// Control buttons component

export default function Controls({
  showOffsetControls,
  setShowOffsetControls,
  offsetX,
  offsetY,
  setOffsetX,
  setOffsetY,
  isFullscreen,
  setIsFullscreen,
  onShowCookieModal
}) {
  return (
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
        onClick={onShowCookieModal}
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
  );
}
