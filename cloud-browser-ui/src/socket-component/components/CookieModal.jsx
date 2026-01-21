export default function CookieModal({
  showCookieModal,
  setShowCookieModal,
  cookieJson,
  setCookieJson,
  cookieStatus,
  setCookieStatus,
  handleImportCookies
}) {
  if (!showCookieModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700">
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
              className={`mt-4 p-3 rounded-lg text-sm ${
                cookieStatus.type === "success"
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
  );
}
