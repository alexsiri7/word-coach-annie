import { WifiOff } from "lucide-react";

export default function OfflinePage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
            <WifiOff className="h-16 w-16 text-muted-foreground mb-6" />
            <h2 className="text-3xl font-bold mb-4">You&apos;re Offline</h2>
            <p className="text-lg text-muted-foreground mb-2">
                This page isn&apos;t available offline yet.
            </p>
            <p className="text-sm text-muted-foreground">
                Pages you&apos;ve visited before will load from cache automatically.
            </p>
        </div>
    );
}
