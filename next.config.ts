import type { NextConfig } from "next";
import withPWA, { runtimeCaching } from "@ducanh2912/next-pwa";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// Generate version.json at build time for version-check polling
function generateVersionFile() {
  let version: string;
  try {
    version = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    version = Date.now().toString();
  }
  const versionData = { version, buildTime: new Date().toISOString() };
  writeFileSync(join(__dirname, "public", "version.json"), JSON.stringify(versionData));
  return version;
}

const buildVersion = generateVersionFile();

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  fallbacks: {
    document: "/_offline",
  },
  workboxOptions: {
    runtimeCaching: [
      // Stale-while-revalidate for API GET requests
      {
        urlPattern: /^\/api\/.*$/i,
        handler: "StaleWhileRevalidate",
        method: "GET",
        options: {
          cacheName: "api-cache",
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // Include the default caches (static assets, fonts, images, etc.)
      ...runtimeCaching,
    ],
  },
})(nextConfig);
