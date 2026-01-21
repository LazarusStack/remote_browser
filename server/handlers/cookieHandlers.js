import { getBrowserInstance, socketBrowserMap } from '../browser/browserManager.js';

export function setupCookieHandlers(socket) {
  // Set cookies handler - applies cookies to browser context
  socket.on("set_cookies", async ({ cookies }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) {
      socket.emit("error", { message: "Not connected to a browser" });
      return;
    }

    try {
      // Transform cookies to Playwright format
      // Chrome extension format is mostly compatible, but we need to ensure required fields
      const playwrightCookies = cookies.map(cookie => {
        // Playwright requires: name, value, and either domain or url
        const pwCookie = {
          name: cookie.name,
          value: cookie.value,
          path: cookie.path || '/',
          httpOnly: cookie.httpOnly || false,
          secure: cookie.secure || false
        };

        // Handle domain - Playwright accepts domain with or without leading dot
        if (cookie.domain) {
          pwCookie.domain = cookie.domain;
        }

        // Handle expiration date - Playwright expects Unix timestamp in seconds
        if (cookie.expirationDate) {
          pwCookie.expires = Math.floor(cookie.expirationDate);
        }

        // Handle sameSite - convert Chrome format to Playwright format
        if (cookie.sameSite) {
          if (cookie.sameSite === 'no_restriction') {
            pwCookie.sameSite = 'None';
          } else if (cookie.sameSite === 'lax') {
            pwCookie.sameSite = 'Lax';
          } else if (cookie.sameSite === 'strict') {
            pwCookie.sameSite = 'Strict';
          }
          // 'unspecified' is not set, Playwright will use default
        }

        return pwCookie;
      });

      // Add cookies to the browser context (shared across all pages and future pages)
      // This is the correct way - cookies set on context are available to all pages
      await browserInstance.context.addCookies(playwrightCookies);

      console.log(`Successfully set ${playwrightCookies.length} cookies for browser ${socketBrowserMap[socket.id]}`);
      socket.emit("cookies_set", { success: true, count: playwrightCookies.length });
    } catch (error) {
      console.error("Error setting cookies:", error);
      socket.emit("cookies_set", { success: false, error: error.message });
    }
  });
}
