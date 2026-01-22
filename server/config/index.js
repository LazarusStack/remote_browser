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
      '--disable-setuid-sandbox'
    ]
  },
  screencast: {
    format: 'jpeg', // JPEG is more widely supported than WebP in CDP
    quality: 40, // Lower = faster encode + smaller + faster transfer (40 is still good quality)
    maxWidth: 1280, // 1080p is overkill for most use cases, 720p is sufficient
    maxHeight: 720,
    everyNthFrame: 1, // Send every frame, we'll throttle on server side
    minFrameInterval: 20 // ~50 FPS max (20ms = 50fps, very smooth) - can go to 16ms for 60fps if needed
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
