import { getBrowserInstance } from '../browser/browserManager.js';

export function setupInteractionHandlers(socket) {
  // Mouse click handler
  socket.on("mouse_click", async ({ tabId, x, y, button = "left" }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (!page || page.isClosed()) return;

    try {
      await page.mouse.click(x, y, { button });
    } catch (error) {
      console.error("Click error:", error);
    }
  });

  // Mouse move handler
  socket.on("mouse_move", async ({ tabId, x, y }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (!page || page.isClosed()) return;

    try {
      await page.mouse.move(x, y);
    } catch (error) {
      console.error("Mouse move error:", error);
    }
  });

  // Keyboard input handler
  socket.on("keyboard_input", async ({ tabId, text, key }) => {
    const browserInstance = getBrowserInstance(socket);
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
  });

  // Scroll handler
  socket.on("scroll", async ({ tabId, deltaX, deltaY }) => {
    const browserInstance = getBrowserInstance(socket);
    if (!browserInstance) return;

    const page = browserInstance.pages[tabId];
    if (!page || page.isClosed()) return;

    try {
      await page.mouse.wheel(deltaX || 0, deltaY || 0);
    } catch (error) {
      console.error("Scroll error:", error);
    }
  });
}
