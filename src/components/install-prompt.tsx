"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function InstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] =
        useState<BeforeInstallPromptEvent | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Check if already installed (standalone mode)
        if (window.matchMedia("(display-mode: standalone)").matches) return;

        // Check if user recently dismissed
        const dismissedAt = localStorage.getItem(DISMISSED_KEY);
        if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DURATION_MS) {
            return;
        }

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setVisible(true);
        };

        window.addEventListener("beforeinstallprompt", handler);

        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
        };
    }, []);

    const handleInstall = useCallback(async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
            setVisible(false);
        }
        setDeferredPrompt(null);
    }, [deferredPrompt]);

    const handleDismiss = useCallback(() => {
        setVisible(false);
        setDeferredPrompt(null);
        localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    }, []);

    if (!visible) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
            <div className="flex items-center gap-3 rounded-lg bg-accent text-accent-foreground px-4 py-3 text-sm shadow-lg">
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Install Annie for quick access</span>
                <button
                    onClick={handleInstall}
                    className="font-medium underline underline-offset-2 hover:opacity-80"
                >
                    Install
                </button>
                <button
                    onClick={handleDismiss}
                    className="ml-1 p-0.5 rounded hover:bg-white/20"
                    aria-label="Dismiss install prompt"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    );
}
