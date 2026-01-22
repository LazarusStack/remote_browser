// Viewport interaction handling hook

import { useRef, useEffect } from "react";

export function useViewport(socketRef, activeTab, offsetX, offsetY, screenshot) {
  const viewportRef = useRef(null);
  const scaleRef = useRef(1);

  // Calculate scale to fill viewport
  useEffect(() => {
    if (viewportRef.current && screenshot) {
      const container = viewportRef.current.parentElement;
      if (container) {
        const availableWidth = container.clientWidth;
        const availableHeight = container.clientHeight;
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(
            availableWidth / img.width,
            availableHeight / img.height
          );
          scaleRef.current = scale;
          // Force re-render to apply scale
          if (viewportRef.current) {
            viewportRef.current.style.transform = `scale(${scale})`;
            viewportRef.current.style.width = `${img.width}px`;
            viewportRef.current.style.height = `${img.height}px`;
          }
        };
        img.src = screenshot;
      }
    }
  }, [screenshot]);

  // Focus viewport when active tab changes
  useEffect(() => {
    if (activeTab && viewportRef.current) {
      viewportRef.current.focus();
    }
  }, [activeTab]);

  const calculateCoordinates = (e) => {
    if (!viewportRef.current) return null;
    
    const rect = viewportRef.current.getBoundingClientRect();
    const scale = scaleRef.current;
    const viewportWidth = 1920;
    const viewportHeight = 1080;
    const scaledWidth = viewportWidth * scale;
    const scaledHeight = viewportHeight * scale;
    
    // Calculate position relative to the viewport's top-left corner (before scaling)
    let x = (e.clientX - rect.left - (rect.width - scaledWidth) / 2) / scale;
    let y = (e.clientY - rect.top - (rect.height - scaledHeight) / 2) / scale;
    
    // Apply offsets
    x += offsetX;
    y += offsetY;
    
    // Clamp to viewport bounds
    const clampedX = Math.max(0, Math.min(viewportWidth, Math.round(x)));
    const clampedY = Math.max(0, Math.min(viewportHeight, Math.round(y)));
    
    return { x: clampedX, y: clampedY };
  };

  const handleClick = (e) => {
    if (!activeTab || !socketRef.current) return;
    
    const coords = calculateCoordinates(e);
    if (!coords) return;
    
    socketRef.current.emit("mouse_click", {
      tabId: activeTab,
      x: coords.x,
      y: coords.y,
      button: e.button === 2 ? "right" : "left"
    });
  };

  const handleMouseMove = (e) => {
    if (!activeTab || !socketRef.current) return;
    
    const coords = calculateCoordinates(e);
    if (!coords) return;
    
    socketRef.current.emit("mouse_move", {
      tabId: activeTab,
      x: coords.x,
      y: coords.y
    });
  };

  const handleWheel = (e) => {
    if (!activeTab || !socketRef.current) return;
    e.preventDefault();
    
    socketRef.current.emit("scroll", {
      tabId: activeTab,
      deltaX: e.deltaX,
      deltaY: e.deltaY
    });
  };

  const handleKeyDown = (e) => {
    if (!activeTab || !socketRef.current) return;
    
    // Handle special keys
    const specialKeys = {
      "Enter": "Enter",
      "Backspace": "Backspace",
      "Delete": "Delete",
      "ArrowUp": "ArrowUp",
      "ArrowDown": "ArrowDown",
      "ArrowLeft": "ArrowLeft",
      "ArrowRight": "ArrowRight",
      "Tab": "Tab",
      "Escape": "Escape"
    };

    if (specialKeys[e.key]) {
      e.preventDefault();
      socketRef.current.emit("keyboard_input", {
        tabId: activeTab,
        key: specialKeys[e.key]
      });
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // Regular character input
      socketRef.current.emit("keyboard_input", {
        tabId: activeTab,
        text: e.key
      });
    }
  };

  return {
    viewportRef,
    scaleRef,
    handleClick,
    handleMouseMove,
    handleWheel,
    handleKeyDown
  };
}
