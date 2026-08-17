"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface AuthUser {
    userId: string;
    email: string;
    name: string;
    picture?: string;
}

export interface AuthState {
    authenticated: boolean;
    user: AuthUser | null;
    loading: boolean;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
}

const SILENT_RENEW_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes

export function useAuth(): AuthState {
    const [authenticated, setAuthenticated] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const renewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const silentRenew = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/refresh", { method: "POST" });
            if (res.status === 401) {
                setAuthenticated(false);
                setUser(null);
                window.location.href = "/login";
            }
        } catch {
            // Network error — do not update auth state; will retry on next interval
        }
    }, []);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const data = await res.json();
                setAuthenticated(data.authenticated);
                setUser(data.user || null);
            } else {
                setAuthenticated(false);
                setUser(null);
            }
        } catch {
            setAuthenticated(false);
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        if (renewTimerRef.current) {
            clearInterval(renewTimerRef.current);
            renewTimerRef.current = null;
        }
        await fetch("/api/auth/logout", { method: "POST" });
        setAuthenticated(false);
        setUser(null);
        window.location.href = "/login";
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Start interval when authenticated; cleanup clears it on unmount or when auth changes.
    useEffect(() => {
        if (!authenticated) return;
        renewTimerRef.current = setInterval(silentRenew, SILENT_RENEW_INTERVAL_MS);
        return () => {
            if (renewTimerRef.current) {
                clearInterval(renewTimerRef.current);
                renewTimerRef.current = null;
            }
        };
    }, [authenticated, silentRenew]);

    return { authenticated, user, loading, logout, refresh };
}
