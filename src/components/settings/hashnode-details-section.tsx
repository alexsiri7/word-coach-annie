"use client";

import { Link2, Link2Off, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HashnodeIntegration } from "./use-hashnode-integration";

export function HashnodeDetailsSection({ hashnode }: { hashnode: HashnodeIntegration }) {
  return (
    <div className="glass-card p-6 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="h-4 w-4 text-accent" />
        <h2 className="text-lg font-semibold text-text-primary">Hashnode</h2>
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Publish your stories directly to Hashnode. Uses a Personal Access Token from your Hashnode dashboard under Settings &rarr; Developer.
      </p>

      {hashnode.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Link2 className="h-4 w-4 text-green-500" />
            <span className="text-text-secondary">
              Connected{hashnode.username ? ` as @${hashnode.username}` : ""}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={hashnode.disconnect}
            disabled={hashnode.disconnecting}
            className="gap-1.5"
          >
            {hashnode.disconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2Off className="h-4 w-4" />
            )}
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Personal Access Token
            </label>
            <Input
              type="password"
              value={hashnode.token}
              onChange={(e) => hashnode.setToken(e.target.value)}
              placeholder="Paste your Hashnode PAT"
            />
            <p className="text-xs text-text-muted mt-1">
              Get it from your Hashnode dashboard: Settings &rarr; Developer &rarr; Personal Access Tokens
            </p>
          </div>
          {hashnode.error && <p className="text-sm text-danger">{hashnode.error}</p>}
          <Button
            onClick={hashnode.connect}
            disabled={hashnode.connecting || !hashnode.token.trim()}
            className="gap-1.5"
          >
            {hashnode.connecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Connect Hashnode
          </Button>
        </div>
      )}
    </div>
  );
}
