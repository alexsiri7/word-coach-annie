import type { Metadata } from "next";
import "./globals.css";
import { OfflineIndicator } from "@/components/offline-indicator";
import { SyncToast } from "@/components/sync-toast";
import { UpdateBanner } from "@/components/update-banner";

export const metadata: Metadata = {
  title: {
    default: "Word Coach Annie",
    template: "%s | Word Coach Annie",
  },
  description: "Local fiction writing & book management tool",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  manifest: "/manifest.json",
  themeColor: "#0f172a",
  openGraph: {
    title: "Word Coach Annie",
    description: "Local fiction writing & book management tool",
    siteName: "Word Coach Annie",
    type: "website",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "Word Coach Annie",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-accent focus:text-accent-foreground focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>
        <UpdateBanner />
        {children}
        <SyncToast />
        <OfflineIndicator />
      </body>
    </html>
  );
}
