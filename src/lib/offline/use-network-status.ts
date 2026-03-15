"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function useNetworkStatus() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [wasOffline, setWasOffline] = useState(false);
  const prevOnlineRef = useRef(isOnline);

  useEffect(() => {
    if (prevOnlineRef.current === false && isOnline) {
      setWasOffline(true);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  return { isOnline, wasOffline };
}
