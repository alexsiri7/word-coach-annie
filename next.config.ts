import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withPWA, { runtimeCaching } from "@ducanh2912/next-pwa";
import withBundleAnalyzer from "@next/bundle-analyzer";
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
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-slot",
    ],
  },
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
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://fonts.googleapis.com https://fonts.gstatic.com",
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

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const pwaConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  cacheOnFrontEndNav: true,
  fallbacks: {
    document: "/_offline",
  },
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
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
      // Cache Google Fonts stylesheets
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "google-fonts-stylesheets",
          expiration: {
            maxEntries: 4,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // Cache Google Fonts webfont files
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts-webfonts",
          expiration: {
            maxEntries: 16,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // Include the default caches (static assets, images, etc.)
      ...runtimeCaching,
    ],
  },
})(nextConfig);

export default withSentryConfig(withAnalyzer(pwaConfig), {
  // Suppresses source map upload logs during build
  silent: true,

  // Upload source maps only when SENTRY_AUTH_TOKEN is set
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Automatically tree-shake Sentry logger statements for smaller bundles
  disableLogger: true,

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Tree-shake optional Sentry features not used in this project
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
  },
});
