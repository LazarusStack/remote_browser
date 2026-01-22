// Tab management hook

import { useState, useEffect } from "react";

export function useTabs(socketRef) {
  const [tabs, setTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [url, setUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;

    socket.on("tabs_list", (tabsList) => {
      setTabs(tabsList);
    });

    socket.on("tab_opened", ({ tabId, url: tabUrl }) => {
      setActiveTab(tabId);
      setCurrentUrl(tabUrl);
      socket.emit("list_tabs");
    });

    socket.on("tab_closed", ({ tabId }) => {
      setActiveTab((currentActiveTab) => {
        if (currentActiveTab === tabId) {
          return null;
        }
        return currentActiveTab;
      });
      socket.emit("list_tabs");
    });

    socket.on("tab_switched", ({ tabId }) => {
      setActiveTab(tabId);
      const tab = tabs.find(t => t.tabId === tabId);
      if (tab) {
        setUrl(tab.url);
      }
    });

    socket.on("url_changed", ({ tabId, url: tabUrl }) => {
      setActiveTab((currentActiveTab) => {
        if (tabId === currentActiveTab) {
          setCurrentUrl(tabUrl);
        }
        return currentActiveTab;
      });
      // Update tabs list
      setTabs(prev => prev.map(tab => 
        tab.tabId === tabId ? { ...tab, url: tabUrl } : tab
      ));
    });

    return () => {
      socket.off("tabs_list");
      socket.off("tab_opened");
      socket.off("tab_closed");
      socket.off("tab_switched");
      socket.off("url_changed");
    };
  }, [socketRef, tabs]);

  // Update currentUrl when activeTab changes
  useEffect(() => {
    if (activeTab) {
      const tab = tabs.find(t => t.tabId === activeTab);
      if (tab) setCurrentUrl(tab.url);
    } else {
      setCurrentUrl("");
    }
  }, [activeTab, tabs]);

  const openTab = (normalizedUrl) => {
    if (!socketRef.current) return;
    socketRef.current.emit("open_tab", { url: normalizedUrl });
    setUrl("");
  };

  const switchTab = (tabId) => {
    if (!socketRef.current) return;
    socketRef.current.emit("switch_tab", { tabId });
  };

  const closeTab = (tabId) => {
    if (!socketRef.current) return;
    socketRef.current.emit("close_tab", { tabId });
  };

  return {
    tabs,
    activeTab,
    setActiveTab,
    url,
    setUrl,
    currentUrl,
    openTab,
    switchTab,
    closeTab
  };
}
