import * as Sentry from "@sentry/nextjs";
import { beforeSend } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
