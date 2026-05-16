import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend,

  // Performance: sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay: capture 1% of sessions, 10% on error
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 0.1,

  integrations: [
    Sentry.replayIntegration({
      // Mask manuscript/editor content — creative writing is user PII
      mask: [".tiptap-editor", ".reader-prose"],
    }),
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
