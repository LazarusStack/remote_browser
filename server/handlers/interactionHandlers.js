// User interaction handlers (mouse, keyboard, scroll, navigation)

import { getBrowserInstance } from '../browser/browserManager.js';

/**
 * Handle mouse click
 */
export async function handleMouseClick(socket, { tabId, x, y, button = "left" }, socketBrowserMap, browserInstances) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) return;

  const page = browserInstance.pages[tabId];
  if (!page || page.isClosed()) return;
  
  try {
    await page.mouse.click(x, y, { button });
  } catch (error) {
    console.error("Click error:", error);
  }
}

/**
 * Handle mouse move
 */
export async function handleMouseMove(socket, { tabId, x, y }, socketBrowserMap, browserInstances) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) return;

  const page = browserInstance.pages[tabId];
  if (!page || page.isClosed()) return;
  
  try {
    await page.mouse.move(x, y);
  } catch (error) {
    console.error("Mouse move error:", error);
  }
}

/**
 * Handle keyboard input
 */
export async function handleKeyboardInput(socket, { tabId, text, key }, socketBrowserMap, browserInstances) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) return;

  const page = browserInstance.pages[tabId];
  if (!page || page.isClosed()) return;
  
  try {
    if (key) {
      // Check if it's a key combination (e.g., "Control+c", "Meta+v")
      if (key.includes("+")) {
        const parts = key.split("+");
        const modifiers = parts.slice(0, -1); // All except last
        const mainKey = parts[parts.length - 1]; // Last part is the actual key
        
        // Press modifiers
        for (const modifier of modifiers) {
          await page.keyboard.down(modifier);
        }
        
        // Press the main key
        await page.keyboard.press(mainKey);
        
        // Release modifiers
        for (const modifier of modifiers.reverse()) {
          await page.keyboard.up(modifier);
        }
      } else {
        // Single key press
        await page.keyboard.press(key);
      }
    } else if (text) {
      await page.keyboard.type(text);
    }
  } catch (error) {
    console.error("Keyboard error:", error);
  }
}

/**
 * Handle scroll
 */
export async function handleScroll(socket, { tabId, deltaX, deltaY }, socketBrowserMap, browserInstances) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) return;

  const page = browserInstance.pages[tabId];
  if (!page || page.isClosed()) return;
  
  try {
    await page.mouse.wheel(deltaX || 0, deltaY || 0);
  } catch (error) {
    console.error("Scroll error:", error);
  }
}

/**
 * Handle navigation
 */
export async function handleNavigate(socket, { tabId, url }, socketBrowserMap, browserInstances) {
  const browserInstance = getBrowserInstance(socket, socketBrowserMap, browserInstances);
  if (!browserInstance) return;

  const page = browserInstance.pages[tabId];
  if (!page || page.isClosed()) return;
  
  try {
    await page.goto(url);
  } catch (error) {
    console.error("Navigation error:", error);
  }
}
