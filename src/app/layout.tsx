import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
