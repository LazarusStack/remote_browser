// Authentication screen component

export default function AuthScreen({ browserCode, setBrowserCode, authError, isLoading, onConnect }) {
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
                  onConnect();
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
            onClick={onConnect}
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
