"use client";

import { useEffect } from "react";

/**
 * Handles service worker lifecycle events.
 * Listens for SW controller changes (after skipWaiting activates a new SW)
 * and reloads the page to ensure the app uses the latest cached assets.
 */
export function SwLifecycle() {
    useEffect(() => {
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
            return;
        }

        // When a new SW takes over (after skipWaiting), reload to get fresh assets
        let refreshing = false;
        const handleControllerChange = () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        };

        navigator.serviceWorker.addEventListener(
            "controllerchange",
            handleControllerChange,
        );

        return () => {
            navigator.serviceWorker.removeEventListener(
                "controllerchange",
                handleControllerChange,
            );
        };
    }, []);

    return null;
}
