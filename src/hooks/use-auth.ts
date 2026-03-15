"use client";

import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
    userId: string;
    email: string;
    name: string;
    picture?: string;
}

export interface AuthState {
    authenticated: boolean;
    authMethod: "google" | "api_token" | null;
    user: AuthUser | null;
    loading: boolean;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
}

export function useAuth(): AuthState {
    const [authenticated, setAuthenticated] = useState(false);
    const [authMethod, setAuthMethod] = useState<"google" | "api_token" | null>(null);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const data = await res.json();
                setAuthenticated(data.authenticated);
                setAuthMethod(data.authMethod || null);
                setUser(data.user || null);
            } else {
                setAuthenticated(false);
                setAuthMethod(null);
                setUser(null);
            }
        } catch {
            setAuthenticated(false);
            setAuthMethod(null);
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setAuthenticated(false);
        setAuthMethod(null);
        setUser(null);
        window.location.href = "/login";
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { authenticated, authMethod, user, loading, logout, refresh };
}
