// Browser list configuration
// In future, fetch from database
export const browserList = [
  { id: "browser_1", code: "ABC123", name: "Browser 1" },
  { id: "browser_2", code: "XYZ789", name: "Browser 2" },
  { id: "browser_3", code: "DEF456", name: "Browser 3" },
  { id: "browser_4", code: "GHI012", name: "Browser 4" },
  { id: "browser_5", code: "JKL345", name: "Browser 5" }
];

// Get browser instance by code
export function getBrowserByCode(code) {
  const browser = browserList.find(b => b.code === code);
  return browser ? browser.id : null;
}
