import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "@/lib/sentry-scrub";

const replayConsented =
  typeof window === "undefined" ||
  localStorage.getItem("consent:sentry_replay") === "true";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend,

  // Performance: sample 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session replay: capture 1% of sessions, 100% on error
  // Masking handles PII — full error sample rate maximises debugging signal
  replaysSessionSampleRate: replayConsented ? 0.01 : 0,
  replaysOnErrorSampleRate: replayConsented ? 1.0 : 0,

  integrations: [
    Sentry.replayIntegration({
      // Mask manuscript/editor content — creative writing is user PII.
      // Also masks version-history preview (.prose-preview) and AI chat
      // responses (.prose-chat) which may echo user manuscript text.
      mask: [".tiptap-editor", ".reader-prose", ".prose-preview", ".prose-chat"],
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
