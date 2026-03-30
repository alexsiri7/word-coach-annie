"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function sanitizeRedirect(from: string | null): string {
    if (!from) return "/";
    if (!from.startsWith("/") || from.startsWith("//") || from.includes("://"))
        return "/";
    return from;
}

function LoginForm() {
    const [token, setToken] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showTokenForm, setShowTokenForm] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
            });

            if (res.ok) {
                const from = sanitizeRedirect(searchParams.get("from"));
                router.push(from);
            } else {
                const data = await res.json().catch(() => null);
                setError(data?.error || "Authentication failed");
            }
        } catch {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    };

    const authError = searchParams.get("error");

    return (
        <div className="space-y-4">
            {authError === "invite_only" && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive">
                    Sorry, this app is invite-only. Your email is not on the
                    access list. Please contact the admin for an invitation.
                </div>
            )}
            <Button
                variant="outline"
                className="w-full"
                asChild
            >
                <a href="/api/auth/google">
                    Sign in with Google
                </a>
            </Button>

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
            </div>

            {showTokenForm ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        type="password"
                        placeholder="Access token"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        autoFocus
                        required
                    />
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
                    <Button
                        type="submit"
                        className="w-full"
                        disabled={loading || !token}
                    >
                        {loading ? "Signing in..." : "Sign in with token"}
                    </Button>
                </form>
            ) : (
                <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={() => setShowTokenForm(true)}
                >
                    Sign in with access token
                </Button>
            )}
        </div>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold">Word Coach Annie</h1>
                    <p className="text-sm text-muted-foreground">
                        Sign in to continue
                    </p>
                </div>
                <Suspense>
                    <LoginForm />
                </Suspense>
            </div>
        </div>
    );
}
