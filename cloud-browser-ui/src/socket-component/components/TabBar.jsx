export default function TabBar({ tabs, activeTab, switchTab, closeTab, setActiveTab, setUrl }) {
  return (
    <div className="flex items-center gap-2 mb-3 overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.tabId}
          onClick={() => switchTab(tab.tabId)}
          className={`flex items-center gap-2 px-4 py-2 rounded-t-lg min-w-[200px] max-w-[400px] truncate cursor-pointer ${
            activeTab === tab.tabId
              ? "bg-gray-900 border-t border-x border-gray-700"
              : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          <span className="text-xs truncate flex-1">{tab.url}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
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
  );
}
