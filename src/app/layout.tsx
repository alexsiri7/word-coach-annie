import type { Metadata } from "next";
import "./globals.css";
import { OfflineIndicator } from "@/components/offline-indicator";
import { SyncToast } from "@/components/sync-toast";
import { UpdateBanner } from "@/components/update-banner";

export const metadata: Metadata = {
  title: "Word Coach Annie",
  description: "Local fiction writing & book management tool",
  icons: {
    icon: "/favicon.png",
  },
  manifest: "/manifest.json",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <UpdateBanner />
        {children}
        <SyncToast />
        <OfflineIndicator />
      </body>
    </html>
  );
}
