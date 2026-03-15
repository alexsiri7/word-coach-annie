"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <main className="min-h-screen">
            <div className="h-1 accent-gradient" />
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4px)] p-6 text-center animate-fade-in">
                <div className="h-20 w-20 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mb-6">
                    <AlertTriangle className="h-9 w-9 text-warning" />
                </div>
                <h1 className="text-4xl font-bold text-text-primary mb-2">
                    Something went wrong
                </h1>
                <p className="text-text-muted mb-8 max-w-sm">
                    An unexpected error occurred. You can try again or head back
                    to your projects.
                </p>
                <div className="flex gap-3">
                    <Button onClick={() => reset()} className="gap-2">
                        <RotateCcw className="h-4 w-4" />
                        Try Again
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/" className="gap-2">
                            <Home className="h-4 w-4" />
                            Back to Projects
                        </Link>
                    </Button>
                </div>
            </div>
        </main>
    );
}
