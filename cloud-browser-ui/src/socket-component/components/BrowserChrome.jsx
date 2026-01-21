import TabBar from './TabBar';

export default function BrowserChrome({
  isFullscreen,
  tabs,
  activeTab,
  switchTab,
  closeTab,
  setActiveTab,
  setUrl,
  url,
  currentUrl,
  handleNavigate,
  openTab
}) {
  if (isFullscreen) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-50 bg-gray-800/95 border-b border-gray-700 backdrop-blur-sm">
      <div className="px-4 py-3">
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          switchTab={switchTab}
          closeTab={closeTab}
          setActiveTab={setActiveTab}
          setUrl={setUrl}
        />

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
  );
}
