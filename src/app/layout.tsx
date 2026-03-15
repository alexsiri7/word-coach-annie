import type { Metadata } from "next";
import "./globals.css";
import { OfflineIndicator } from "@/components/offline-indicator";

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
        {children}
        <OfflineIndicator />
      </body>
    </html>
  );
}
