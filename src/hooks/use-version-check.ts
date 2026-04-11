"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const CHECK_INTERVAL = 60_000; // 60 seconds

export function useVersionCheck() {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const loadedVersion = useRef<string | null>(null);

    const checkVersion = useCallback(async () => {
        try {
            const res = await fetch("/version.json", {
                cache: "no-store",
                headers: { "Cache-Control": "no-cache" },
            });
            if (!res.ok) return;
            const data = await res.json();
            const serverVersion = data.version;

            if (!loadedVersion.current) {
                // First check — store the version
                loadedVersion.current = serverVersion;
                return;
            }

            if (serverVersion !== loadedVersion.current) {
                setUpdateAvailable(true);
            }
        } catch {
            // Network error — skip silently
        }
    }, []);

    useEffect(() => {
        if (dismissed) return;

        // Initial check after a short delay
        const initialTimer = setTimeout(checkVersion, 5000);

        // Periodic polling
        const interval = setInterval(checkVersion, CHECK_INTERVAL);

        // Check on visibility change (tab refocus)
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                checkVersion();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [checkVersion, dismissed]);

    const dismiss = useCallback(() => {
        setDismissed(true);
    }, []);

    const refresh = useCallback(() => {
        window.location.reload();
    }, []);

    return {
        showBanner: updateAvailable && !dismissed,
        dismiss,
        refresh,
    };
}
