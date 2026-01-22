// Configuration management
export const config = {
  port: process.env.PORT || 3000,
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
    : ["*"],
  browser: {
    viewport: { width: 1920, height: 1080 },
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
      '--disable-ipc-flooding-protection'
    ]
  },
  screencast: {
    format: 'jpeg', // JPEG is more widely supported than WebP in CDP
    quality: 20, // Very low quality = fastest encoding (needed for 30+ FPS at 1080p)
    maxWidth: 1920, // Keep 1080p for cursor coordinate accuracy
    maxHeight: 1080,
    everyNthFrame: 1, // Send every frame from CDP
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
