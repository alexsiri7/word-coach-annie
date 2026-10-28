import * as Sentry from "@sentry/nextjs";
import { beforeBreadcrumb, beforeSend, dataCollection } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // v11: replaces `sendDefaultPii: false`; see sentry-scrub.ts.
  dataCollection,
  beforeSend,
  beforeBreadcrumb,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
