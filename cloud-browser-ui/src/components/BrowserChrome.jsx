// Browser chrome UI (tabs, address bar)

export default function BrowserChrome({
  tabs,
  activeTab,
  url,
  currentUrl,
  setUrl,
  onSwitchTab,
  onCloseTab,
  onOpenTab,
  onNavigate,
  onNewTab
}) {
  return (
    <div className="absolute top-0 left-0 right-0 z-50 bg-gray-800/95 border-b border-gray-700 backdrop-blur-sm">
      <div className="px-4 py-3">
        {/* Tab Bar */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.tabId}
              onClick={() => onSwitchTab(tab.tabId)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg min-w-[200px] max-w-[400px] cursor-pointer ${
                activeTab === tab.tabId
                  ? "bg-gray-900 border-t border-x border-gray-700"
                  : "bg-gray-700 hover:bg-gray-600"
              }`}
            >
              <span className="text-xs truncate flex-1">{tab.url}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevent tab switch when clicking close
                  onCloseTab(tab.tabId);
                }}
                className="text-gray-400 hover:text-white text-sm"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={onNewTab}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            +
          </button>
        </div>

        {/* Address Bar */}
        <div className="flex gap-2 items-center">
          <div className="flex gap-2 flex-1">
            <button
              onClick={() => activeTab && onSwitchTab(activeTab)}
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
                    onNavigate();
                  } else {
                    onOpenTab();
                  }
                }
              }}
              placeholder="Enter URL or search"
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={activeTab ? onNavigate : onOpenTab}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              disabled={!url && !activeTab}
            >
              {activeTab ? "Go" : "Open"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
