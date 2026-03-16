import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 100% of errors, sample 10% of transactions for performance
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Filter noisy browser errors
  ignoreErrors: [
    // Network errors users cause by navigating away
    "Failed to fetch",
    "Load failed",
    "NetworkError",
    "AbortError",
    // Browser extension noise
    "ResizeObserver loop",
  ],

  beforeSend(event) {
    // Strip PII from breadcrumbs (URLs may contain tokens)
    if (event.breadcrumbs) {
      for (const crumb of event.breadcrumbs) {
        if (crumb.data?.url) {
          try {
            const url = new URL(crumb.data.url, window.location.origin);
            url.searchParams.delete("token");
            url.searchParams.delete("code");
            crumb.data.url = url.toString();
          } catch {
            // URL parsing failed, leave as-is
          }
        }
      }
    }
    return event;
  },
});
