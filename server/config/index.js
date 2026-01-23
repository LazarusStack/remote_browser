// Configuration management
export const config = {
  port: process.env.PORT || 3000,
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ["*"],
  browser: {
    viewport: { width: 1280, height: 720 },
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // Performance optimizations for faster screencast encoding
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-ipc-flooding-protection',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--disable-features=TranslateUI',
      // Additional flags for better screencast performance
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-blink-features=AutomationControlled',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-translate',
      '--disable-hang-monitor',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-features=RendererCodeIntegrity',
      '--force-color-profile=srgb',
      '--memory-pressure-off',
      '--max_old_space_size=4096'
    ]
  },
  screencast: {
    format: 'jpeg', // JPEG is more widely supported than WebP in CDP
    quality: 25, // Lower quality for faster encoding, especially important for video
    maxWidth: 1280, // Reduced from 1920 for faster CDP encoding (720p)
    maxHeight: 720, // Reduced from 1080 for faster CDP encoding (720p)
    everyNthFrame: 1, // Send every frame from CDP (we handle skipping in code for video)
    minFrameInterval: 16 // ~60 FPS max (16ms = 60fps) - CDP encoding is the real bottleneck
  }
};

// Mock browser list - in future, fetch from database 
export const browserList = [
  { id: "browser_1", code: "ABC123", name: "Browser 1" },
  { id: "browser_2", code: "XYZ789", name: "Browser 2" },
  { id: "browser_3", code: "DEF456", name: "Browser 3" },
  { id: "browser_4", code: "GHI012", name: "Browser 4" },
  { id: "browser_5", code: "JKL345", name: "Browser 5" }
];
