import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

const pwaConfig = withPWA({
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

export default withSentryConfig(pwaConfig, {
  // Suppress source map upload warnings when SENTRY_AUTH_TOKEN is not set
  silent: !process.env.SENTRY_AUTH_TOKEN,
  // Disable source map upload unless explicitly configured
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Disable telemetry for build speed
  telemetry: false,
});
