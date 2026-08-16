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

/**
 * How often to silently renew the JWT session cookie.
 *
 * The server-side SESSION_MAX_AGE is 1 hour (3600 s). We renew at 45 minutes
 * so there is a 15-minute buffer before the cookie actually expires. The renewal
 * runs through POST /api/auth/refresh, which executes in the Node.js runtime
 * (not Edge) so it can consult the revocation blocklist — an explicitly logged-out
 * session will NOT be renewed.
 */
const SILENT_RENEW_INTERVAL_MS = 45 * 60 * 1000; // 45 minutes

export function useAuth(): AuthState {
    const [authenticated, setAuthenticated] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);
    const renewTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    /**
     * Silently renew the session cookie via the Node.js refresh endpoint.
     * On 401 the session has expired or been revoked — redirect to login.
     * Network errors are ignored (transient); the cookie will expire naturally.
     */
    const silentRenew = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/refresh", { method: "POST" });
            if (res.status === 401) {
                // Session revoked or truly expired; send user to login.
                setAuthenticated(false);
                setUser(null);
                window.location.href = "/login";
            }
            // 200 → new cookie was set server-side; nothing to do on the client.
        } catch {
            // Transient network error — leave the existing cookie in place.
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

    // Kick off initial auth check on mount.
    useEffect(() => {
        refresh();
    }, [refresh]);

    // Start (or restart) the silent-renew interval whenever authentication state changes.
    // The interval only runs while the user is authenticated to avoid unnecessary requests.
    useEffect(() => {
        if (renewTimerRef.current) {
            clearInterval(renewTimerRef.current);
            renewTimerRef.current = null;
        }

        if (authenticated) {
            renewTimerRef.current = setInterval(silentRenew, SILENT_RENEW_INTERVAL_MS);
        }

        return () => {
            if (renewTimerRef.current) {
                clearInterval(renewTimerRef.current);
                renewTimerRef.current = null;
            }
        };
    }, [authenticated, silentRenew]);

    return { authenticated, user, loading, logout, refresh };
}
