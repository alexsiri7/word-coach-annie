import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, Search } from "lucide-react";

export default function NotFound() {
    return (
        <main className="min-h-screen">
            <div className="h-1 accent-gradient" />
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4px)] p-6 text-center animate-fade-in">
                <div className="h-20 w-20 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mb-6">
                    <Search className="h-9 w-9 text-text-muted" />
                </div>
                <h1 className="text-6xl font-bold text-text-primary mb-2">404</h1>
                <h2 className="text-xl font-semibold text-text-primary mb-2">
                    Page not found
                </h2>
                <p className="text-text-muted mb-8 max-w-sm">
                    The page you&apos;re looking for doesn&apos;t exist or may have been
                    moved. Try heading back to your projects.
                </p>
                <div className="flex gap-3">
                    <Button asChild>
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
