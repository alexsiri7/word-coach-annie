"use client";

import { Link2, Link2Off, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GoogleDocsIntegration } from "./use-google-docs-integration";

export function GoogleDocsSection({ googleDocs }: { googleDocs: GoogleDocsIntegration }) {
  return (
    <div className="glass-card p-6 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 fill-current text-accent" aria-hidden="true">
          <path d="M14.727 6.727H14V0H4.91C4.085 0 3.818.272 3.818 1.091v21.818c0 .82.267 1.091 1.09 1.091h14.19c.82 0 1.09-.271 1.09-1.09V6.727h-5.46zm.545 10.455H8.727v-1.364h6.545v1.364zm0-3.273H8.727v-1.364h6.545v1.364zm0-3.273H8.727V9.273h6.545v1.363zM14.727 6h6l-6-6v6z"/>
        </svg>
        <h2 className="text-lg font-semibold text-text-primary">Google Docs</h2>
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Export your stories to Google Docs and sync reader comments back as annotations. Requires a Google account with Docs and Drive access.
      </p>

      {googleDocs.loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : googleDocs.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Link2 className="h-4 w-4 text-green-500" />
            <span className="text-text-secondary">Connected — Google Docs access granted</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={googleDocs.disconnect}
            disabled={googleDocs.disconnecting}
            className="gap-1.5"
          >
            {googleDocs.disconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2Off className="h-4 w-4" />
            )}
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-primary">Not connected</p>
          <p className="text-xs text-text-muted">
            Click Connect to authorize access to your Google Docs and Drive.
          </p>
          <Button
            size="sm"
            onClick={() => { window.location.href = "/api/auth/google-docs"; }}
            className="gap-1.5"
          >
            <Link2 className="h-4 w-4" />
            Connect Google Docs
          </Button>
        </div>
      )}
    </div>
  );
}
