// Cookie management handlers

import { getBrowserInstance } from '../browser/browserManager.js';

/**
 * Transform cookie format from extension format to Playwright format
 */
function transformCookie(cookie) {
  const pwCookie = {
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || '/',
    httpOnly: cookie.httpOnly || false,
    secure: cookie.secure || false
  };

  // Handle domain
  if (cookie.domain) {
    pwCookie.domain = cookie.domain;
  }

  // Handle expiration date
  if (cookie.expirationDate) {
    pwCookie.expires = Math.floor(cookie.expirationDate);
  }

  // Handle sameSite
  if (cookie.sameSite) {
    if (cookie.sameSite === 'no_restriction') {
      pwCookie.sameSite = 'None';
    } else if (cookie.sameSite === 'lax') {
      pwCookie.sameSite = 'Lax';
    } else if (cookie.sameSite === 'strict') {
      pwCookie.sameSite = 'Strict';
    }
  }

  return pwCookie;
}

/**
 * Handle set_cookies event
 */
export async function handleSetCookies(socket, { cookies }, socketBrowserMap, browserInstances) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) {
    socket.emit("error", { message: "Not connected to a browser" });
    return;
  }

  try {
    // Transform cookies to Playwright format
    const playwrightCookies = cookies.map(transformCookie);

    // Add cookies to the browser context
    await browserInstance.context.addCookies(playwrightCookies);

    const browserId = socketBrowserMap[socket.id];
    console.log(`Successfully set ${playwrightCookies.length} cookies for browser ${browserId}`);
    socket.emit("cookies_set", { success: true, count: playwrightCookies.length });
  } catch (error) {
    console.error("Error setting cookies:", error);
    socket.emit("cookies_set", { success: false, error: error.message });
  }
}
