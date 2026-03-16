"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ padding: "2rem", textAlign: "center", fontFamily: "system-ui" }}>
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. Please try again.</p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              marginTop: "1rem",
              cursor: "pointer",
              borderRadius: "0.375rem",
              border: "1px solid #ccc",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
