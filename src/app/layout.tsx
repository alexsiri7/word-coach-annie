import type { Metadata } from "next";
import "./globals.css";
import { OfflineIndicator } from "@/components/offline-indicator";
import { SyncToast } from "@/components/sync-toast";
import { UpdateBanner } from "@/components/update-banner";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: {
    default: "Word Coach Annie",
    template: "%s | Word Coach Annie",
  },
  description: "Local fiction writing & book management tool",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
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
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Word Coach Annie — Fiction writing & book management",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Word Coach Annie",
    description: "Local fiction writing & book management tool",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-accent focus:text-accent-foreground focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium"
          >
            Skip to content
          </a>
          <UpdateBanner />
          <ToastProvider>
            {children}
            <SyncToast />
          </ToastProvider>
          <OfflineIndicator />
        </ThemeProvider>
      </body>
    </html>
  );
}
