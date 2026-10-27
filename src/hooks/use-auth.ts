"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { clearClientData } from "@/lib/offline/clear-client-data";

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

// /api/auth/me shares the 5-per-minute per-IP auth rate limit with login and refresh,
// and UserMenu remounts on every page, so a tab reuses a signed-in answer for one window.
export const CURRENT_USER_CACHE_MS = 60 * 1000;

interface CurrentUser {
    authenticated: boolean;
    user: AuthUser | null;
}

let cachedCurrentUser: { fetchedAt: number; result: Promise<CurrentUser> } | null = null;

async function requestCurrentUser(): Promise<CurrentUser> {
    try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return { authenticated: false, user: null };
        const data = await res.json();
        return { authenticated: data.authenticated, user: data.user || null };
    } catch {
        return { authenticated: false, user: null };
    }
}

export function fetchCurrentUser({ fresh = false } = {}): Promise<CurrentUser> {
    const now = Date.now();
    if (!fresh && cachedCurrentUser && now - cachedCurrentUser.fetchedAt < CURRENT_USER_CACHE_MS) {
        return cachedCurrentUser.result;
    }
    const entry = { fetchedAt: now, result: requestCurrentUser() };
    cachedCurrentUser = entry;
    entry.result.then(({ authenticated }) => {
        if (!authenticated && cachedCurrentUser === entry) cachedCurrentUser = null;
    });
    return entry.result;
}

export function useAuth(): AuthState {
    const [authenticated, setAuthenticated] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const renewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearRenewTimer = useCallback(() => {
        if (renewTimerRef.current) {
            clearInterval(renewTimerRef.current);
            renewTimerRef.current = null;
        }
    }, []);

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

    const load = useCallback(async (fresh: boolean) => {
        const current = await fetchCurrentUser({ fresh });
        setAuthenticated(current.authenticated);
        setUser(current.user);
        setLoading(false);
    }, []);

    const refresh = useCallback(() => load(true), [load]);

    const logout = useCallback(async () => {
        clearRenewTimer();
        await fetch("/api/auth/logout", { method: "POST" });
        await clearClientData();
        setAuthenticated(false);
        setUser(null);
        window.location.href = "/login";
    }, [clearRenewTimer]);

    useEffect(() => {
        load(false);
    }, [load]);

    // Start interval when authenticated; cleanup clears it on unmount or when auth changes.
    useEffect(() => {
        if (!authenticated) return;
        renewTimerRef.current = setInterval(silentRenew, SILENT_RENEW_INTERVAL_MS);
        return clearRenewTimer;
    }, [authenticated, silentRenew, clearRenewTimer]);

    return { authenticated, user, loading, logout, refresh };
}
