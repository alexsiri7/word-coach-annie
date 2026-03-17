import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance: sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay: capture 1% of sessions, 100% on error
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // Browser tracing loaded eagerly (required for initial page load spans)
  // Replay loaded lazily after hydration to reduce initial bundle impact
  integrations: [
    Sentry.browserTracingIntegration(),
  ],

  // Filter out noisy errors
  ignoreErrors: [
    // Browser extensions
    "ResizeObserver loop",
    // Network errors from offline PWA usage
    "Failed to fetch",
    "NetworkError",
    "Load failed",
  ],
});

// Defer session replay integration until after page is interactive
if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    setTimeout(() => {
      Sentry.addIntegration(Sentry.replayIntegration());
    }, 3000);
  });
}
