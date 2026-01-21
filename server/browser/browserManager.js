// Browser instance management

// Browser instances storage: browserId -> { browser, context, pages, tabCounter, etc. }
export const browserInstances = {}; // browserId -> browser instance data
export const socketBrowserMap = {}; // socketId -> browserId

let chromium = null;

// Structure for each browser instance
export function createBrowserInstance() {
  return {
    browser: null,
    context: null,
    pages: {}, // tabId -> page
    tabCounter: 0,
    activeTabs: [], // tabId
    cdpSessions: {}, // tabId -> CDP session
    screencastActive: {}, // tabId -> boolean
    tabViewers: {}, // tabId -> Set of socketIds viewing this tab
    webrtcConnections: {}, // socketId -> { tabId -> RTCPeerConnection }
    webrtcDataChannels: {} // socketId -> { tabId -> RTCDataChannel }
  };
}

export async function initChromium() {
  if (!chromium) {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  }
  return chromium;
}

export async function initBrowser(browserId) {
  // Check if browser instance already exists
  if (browserInstances[browserId]?.browser) {
    return browserInstances[browserId];
  }

  const playwright = await import("playwright");
  const chromium = playwright.chromium;

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // Make browser less detectable
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    // Use a realistic user agent to avoid bot detection
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Set locale and timezone
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // Add permissions
    permissions: ['geolocation'],
    // Set geolocation (optional, helps with some sites)
    geolocation: { latitude: 40.7128, longitude: -74.0060 },
    // Set color scheme
    colorScheme: 'light',
    // Add extra HTTP headers to look more like a real browser
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    }
  });

  // Remove webdriver property to avoid detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });
    
    // Override plugins to look more realistic
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
  });

  // Create or update browser instance
  if (!browserInstances[browserId]) {
    browserInstances[browserId] = createBrowserInstance();
  }

  browserInstances[browserId].browser = browser;
  browserInstances[browserId].context = context;

  return browserInstances[browserId];
}

// Helper function to get browser instance for a socket
export function getBrowserInstance(socket) {
  const browserId = socketBrowserMap[socket.id];
  if (!browserId) {
    return null;
  }
  return browserInstances[browserId];
}
