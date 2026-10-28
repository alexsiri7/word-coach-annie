"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

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
    <html>
      <body>
        <div className="p-8 text-center">
          <h2>Something went wrong</h2>
          <p className="mt-2 text-[#666]">
            The error has been reported automatically.
          </p>
          <button onClick={reset} className="mt-4 px-4 py-2 cursor-pointer border rounded">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
