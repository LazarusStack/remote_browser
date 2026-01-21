// Viewport interaction handlers

export const createViewportHandlers = (activeTab, viewportRef, scaleRef, offsetX, offsetY, socketRef) => {
  const viewportWidth = 1920;
  const viewportHeight = 1080;

  const calculatePosition = (e) => {
    if (!viewportRef.current) return null;

    const rect = viewportRef.current.getBoundingClientRect();
    const scale = scaleRef.current;
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

  const handleViewportClick = (e) => {
    if (!activeTab || !viewportRef.current || !socketRef.current) return;

    const pos = calculatePosition(e);
    if (!pos) return;

    socketRef.current.emit("mouse_click", {
      tabId: activeTab,
      x: pos.x,
      y: pos.y,
      button: e.button === 2 ? "right" : "left"
    });
  };

  const handleViewportMouseMove = (e) => {
    if (!activeTab || !viewportRef.current || !socketRef.current) return;

    const pos = calculatePosition(e);
    if (!pos) return;

    socketRef.current.emit("mouse_move", {
      tabId: activeTab,
      x: pos.x,
      y: pos.y
    });
  };

  const handleViewportWheel = (e) => {
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
      // Navigation
      "Enter": "Enter",
      "Tab": "Tab",
      "Escape": "Escape",
      "Backspace": "Backspace",
      "Delete": "Delete",
      "Insert": "Insert",

      // Arrow keys
      "ArrowUp": "ArrowUp",
      "ArrowDown": "ArrowDown",
      "ArrowLeft": "ArrowLeft",
      "ArrowRight": "ArrowRight",

      // Modifier keys
      "Control": "Control",
      "Meta": "Meta", // Command on Mac
      "Alt": "Alt",
      "Shift": "Shift",

      // Function keys
      "F1": "F1", "F2": "F2", "F3": "F3", "F4": "F4", "F5": "F5",
      "F6": "F6", "F7": "F7", "F8": "F8", "F9": "F9", "F10": "F10",
      "F11": "F11", "F12": "F12",

      // Navigation keys
      "Home": "Home",
      "End": "End",
      "PageUp": "PageUp",
      "PageDown": "PageDown",

      // Other special keys
      "CapsLock": "CapsLock",
      "NumLock": "NumLock",
      "ScrollLock": "ScrollLock",
      "Pause": "Pause",
      "PrintScreen": "PrintScreen",
      "ContextMenu": "ContextMenu",

      // Media keys
      "AudioVolumeUp": "AudioVolumeUp",
      "AudioVolumeDown": "AudioVolumeDown",
      "AudioVolumeMute": "AudioVolumeMute",
      "MediaPlayPause": "MediaPlayPause",
      "MediaStop": "MediaStop",
      "MediaTrackNext": "MediaTrackNext",
      "MediaTrackPrevious": "MediaTrackPrevious"
    };

    // Handle modifier key combinations (Ctrl+C, Cmd+V, etc.)
    if (e.ctrlKey || e.metaKey || e.altKey) {
      const modifiers = [];
      if (e.ctrlKey) modifiers.push("Control");
      if (e.metaKey) modifiers.push("Meta");
      if (e.altKey) modifiers.push("Alt");
      if (e.shiftKey) modifiers.push("Shift");

      const key = e.key;

      if (specialKeys[key]) {
        e.preventDefault();
        const combination = modifiers.length > 0
          ? `${modifiers.join("+")}+${specialKeys[key]}`
          : specialKeys[key];
        socketRef.current.emit("keyboard_input", {
          tabId: activeTab,
          key: combination
        });
      } else if (key.length === 1) {
        e.preventDefault();
        const combination = `${modifiers.join("+")}+${key}`;
        socketRef.current.emit("keyboard_input", {
          tabId: activeTab,
          key: combination
        });
      }
    } else if (specialKeys[e.key]) {
      e.preventDefault();
      socketRef.current.emit("keyboard_input", {
        tabId: activeTab,
        key: specialKeys[e.key]
      });
    } else if (e.key.length === 1) {
      socketRef.current.emit("keyboard_input", {
        tabId: activeTab,
        text: e.key
      });
    }
  };

  return {
    handleViewportClick,
    handleViewportMouseMove,
    handleViewportWheel,
    handleKeyDown
  };
};
