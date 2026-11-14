"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { PersonalTokenScope } from "@/lib/personal-tokens";

interface ApiTokenSummary {
  id: string;
  name: string;
  scope: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const SCOPE_LABELS: Record<string, string> = {
  read: "Read only",
  write: "Read & write scenes",
  snapshots: "Post location snapshots",
} satisfies Record<PersonalTokenScope, string>;

function isScope(value: string): value is PersonalTokenScope {
  return Object.hasOwn(SCOPE_LABELS, value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Settings card for creating, listing and revoking personal API tokens. */
export function ApiTokensCard() {
  const [tokens, setTokens] = useState<ApiTokenSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<PersonalTokenScope>("read");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenSummary | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadTokens = useCallback(() => {
    setLoading(true);
    fetch("/api/account/api-tokens")
      .then((res) => {
        if (!res.ok) throw new Error(`api tokens fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { tokens: ApiTokenSummary[] }) => setTokens(data.tokens))
      .catch((err) => {
        console.error(err);
        setTokens(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/account/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
        body: JSON.stringify({ name: trimmed, scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `api token create failed: ${res.status}`);
      setNewToken(data.token);
      setTokens((prev) => [data.apiToken, ...(prev ?? [])]);
      setName("");
    } catch (err) {
      console.error("Failed to create API token", err);
      setCreateError(err instanceof Error ? err.message : "Couldn't create the token");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy API token", err);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/account/api-tokens/${encodeURIComponent(revokeTarget.id)}`, {
        method: "DELETE",
        headers: { "X-CSRF-Protection": "1" },
      });
      if (!res.ok && res.status !== 404) throw new Error(`api token revoke failed: ${res.status}`);
      setTokens((prev) => prev?.filter((t) => t.id !== revokeTarget.id) ?? prev);
      setRevokeTarget(null);
    } catch (err) {
      console.error("Failed to revoke API token", err);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <div className="glass-card p-6 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-4 w-4 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">API tokens</h2>
        </div>
        <p className="text-sm text-text-secondary mb-4">
          Let another app read or edit your scenes as you, or let a game post snapshots of its locations. Tokens can reach nothing else.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tokens ? (
          <div className="space-y-4">
            {newToken && (
              <div className="rounded-md border border-accent p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Input readOnly value={newToken} aria-label="New API token" className="font-mono text-xs" />
                  <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 shrink-0">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-text-muted">
                  Copy this token now — you won&apos;t be able to see it again.
                </p>
                <Button variant="outline" size="sm" onClick={() => setNewToken(null)}>
                  Done
                </Button>
              </div>
            )}

            {tokens.length > 0 ? (
              <ul className="divide-y divide-border">
                {tokens.map((token) => (
                  <li key={token.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-text-primary truncate">{token.name}</p>
                      <p className="text-xs text-text-muted">
                        {SCOPE_LABELS[token.scope] ?? token.scope} · <span className="font-mono">…{token.hint}</span> ·
                        Created {formatDate(token.createdAt)} ·{" "}
                        {token.lastUsedAt ? `Last used ${formatDate(token.lastUsedAt)}` : "Never used"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRevokeTarget(token)}
                      className="gap-1.5 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">No tokens yet.</p>
            )}

            <div className="border-t border-border pt-4 space-y-3">
              <div>
                <label htmlFor="api-token-name" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Name
                </label>
                <Input
                  id="api-token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Punland scene editor"
                  maxLength={100}
                />
              </div>
              <div>
                <label htmlFor="api-token-scope" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Access
                </label>
                <Select value={scope} onValueChange={(v) => setScope(isScope(v) ? v : "read")}>
                  <SelectTrigger id="api-token-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">{SCOPE_LABELS.read}</SelectItem>
                    <SelectItem value="write">{SCOPE_LABELS.write}</SelectItem>
                    <SelectItem value="snapshots">{SCOPE_LABELS.snapshots}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {createError && <p className="text-xs text-red-500">{createError}</p>}
              <Button size="sm" onClick={handleCreate} disabled={creating || !name.trim()} className="gap-1.5">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create token
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-text-muted">Couldn&apos;t load your tokens.</p>
            <Button variant="outline" size="sm" onClick={loadTokens} className="gap-1.5">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Apps using it stop working immediately. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke} disabled={revoking}>
              {revoking ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
