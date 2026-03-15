"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
    const [token, setToken] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
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
                const from = searchParams.get("from") || "/";
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

    return (
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
                {loading ? "Signing in..." : "Sign in"}
            </Button>
        </form>
    );
}

export default function LoginPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold">Word Coach Annie</h1>
                    <p className="text-sm text-muted-foreground">
                        Enter your access token to continue
                    </p>
                </div>
                <Suspense>
                    <LoginForm />
                </Suspense>
            </div>
        </div>
    );
}
