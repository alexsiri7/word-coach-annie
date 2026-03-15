"use client";

import { useVersionCheck } from "@/hooks/use-version-check";
import { X } from "lucide-react";

export function UpdateBanner() {
    const { showBanner, dismiss, refresh } = useVersionCheck();

    if (!showBanner) return null;

    return (
        <div role="alert" className="fixed top-0 inset-x-0 z-[100] bg-accent text-accent-foreground px-4 py-2 text-sm flex items-center justify-center gap-3 animate-slide-down shadow-md">
            <span>A new version is available.</span>
            <button
                onClick={refresh}
                className="font-medium underline underline-offset-2 hover:opacity-80"
            >
                Refresh to update
            </button>
            <button
                onClick={dismiss}
                className="ml-2 p-0.5 rounded hover:bg-white/20"
                aria-label="Dismiss"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}
