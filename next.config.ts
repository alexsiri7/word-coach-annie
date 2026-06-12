import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withPWA, { runtimeCaching } from "@ducanh2912/next-pwa";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// Generate version.json at build time for version-check polling
function generateVersionFile() {
  let commitSha: string;
  try {
    const envSha = process.env.COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA;
    commitSha = envSha ? envSha.substring(0, 7) : execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    commitSha = "unknown";
  }
  const versionData = { version: commitSha, commitSha, buildTime: new Date().toISOString() };
  writeFileSync(join(__dirname, "public", "version.json"), JSON.stringify(versionData));
  return commitSha;
}

const buildVersion = generateVersionFile();

const nextConfig: NextConfig = {
  output: "standalone",
  // isomorphic-dompurify: externalized because its ESM/CJS hybrid does not bundle correctly
  // under webpack in Next.js 16 (peer issue with dompurify's jsdom path).
  // ioredis: uses node:diagnostics_channel (Node.js built-in) which webpack cannot bundle
  serverExternalPackages: ["@prisma/adapter-pg", "isomorphic-dompurify", "ioredis"],
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
          // SEC-013: HSTS — 2-year max-age with includeSubDomains.
          // preload omitted intentionally: requires HSTS preload list submission
          // and is irreversible without a long lead time. Add preload once the
          // domain is confirmed stable.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // SEC-018: Permissions-Policy — disable browser APIs this app never uses.
          // Defense-in-depth: prevents XSS or third-party scripts from escalating
          // to sensitive device permission requests.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
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
      // Never cache OAuth or auth routes — the SW must not intercept redirects
      // in the OAuth flow or serve stale responses for login/consent pages.
      {
        urlPattern: ({ url }: { url: URL }) =>
          url.pathname.startsWith("/oauth/") || url.pathname.startsWith("/api/auth/"),
        handler: "NetworkOnly" as const,
      },
      // Cache Google Fonts stylesheets
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: "StaleWhileRevalidate" as const,
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
        handler: "CacheFirst" as const,
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
      // App shell routes — serve from cache first, revalidate in background.
      // Placed before the default spread so it overrides the default document/pages
      // handler (which uses NetworkFirst and requires a network attempt offline).
      {
        urlPattern: ({ request, url }: { request: Request; url: URL }) =>
          request.mode === "navigate" &&
          (url.pathname === "/" || url.pathname.startsWith("/projects/")),
        handler: "StaleWhileRevalidate" as const,
        options: {
          cacheName: "app-shell",
          expiration: {
            maxEntries: 32,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      // Include the default caches (static assets, images, etc.)
      // Filter out the built-in `apis` entry — authenticated API responses
      // must not be cached on shared devices (MED-17).
      // NOTE: "apis" is the cacheName used by @ducanh2912/next-pwa ≥10.x.
      // Verify this string if upgrading the package.
      ...runtimeCaching.filter((entry) => entry.options?.cacheName !== "apis"),
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
});
