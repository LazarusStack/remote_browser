// Offset configuration hook

import { useState, useEffect } from "react";

const STORAGE_KEY = 'browser_offset_config';

export function useOffsets() {
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // Load offsets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const config = JSON.parse(saved);
        setOffsetX(config.x || 0);
        setOffsetY(config.y || 0);
      } catch (e) {
        console.error('Failed to load offset config:', e);
      }
    }
  }, []);

  // Listen for offset updates from offset-config app
  useEffect(() => {
    // Listen for postMessage from offset-config app
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'OFFSET_UPDATE') {
        setOffsetX(event.data.x || 0);
        setOffsetY(event.data.y || 0);
      }
    };
    
    // Listen for storage changes (when offset-config saves)
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const config = JSON.parse(e.newValue);
          setOffsetX(config.x || 0);
          setOffsetY(config.y || 0);
        } catch (err) {
          console.error('Failed to parse offset config:', err);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorageChange);
    
    // Also poll localStorage periodically as a fallback
    const interval = setInterval(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const config = JSON.parse(saved);
          if (config.x !== offsetX || config.y !== offsetY) {
            setOffsetX(config.x || 0);
            setOffsetY(config.y || 0);
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }, 500);
    
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [offsetX, offsetY]);

  return { offsetX, setOffsetX, offsetY, setOffsetY };
}
