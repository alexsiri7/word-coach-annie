"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Check, Eye, EyeOff, Settings, Sparkles, MessageSquare, Link2, Link2Off, Loader2 } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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

interface AiSettingsData {
  baseUrl: string;
  apiKey: string;
  model: string;
  hasApiKey?: boolean;
  scope?: "user" | "global";
  customInstructions?: string;
  coachingStyle?: string;
  responseLength?: string;
}

export default function SettingsPage() {
  const router = useRouter();

  // AI settings state
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"user" | "global">("global");

  // AI behavior preferences
  const [customInstructions, setCustomInstructions] = useState("");
  const [coachingStyle, setCoachingStyle] = useState("balanced");
  const [responseLength, setResponseLength] = useState("moderate");

  // Hashnode integration state
  const [hashnodeLoading, setHashnodeLoading] = useState(true);
  const [hashnodeConnected, setHashnodeConnected] = useState(false);
  const [hashnodeUsername, setHashnodeUsername] = useState<string | null>(null);
  const [hashnodeConnectOpen, setHashnodeConnectOpen] = useState(false);
  const [hashnodeDisconnectOpen, setHashnodeDisconnectOpen] = useState(false);
  const [hashnodeToken, setHashnodeToken] = useState("");
  const [hashnodeConnecting, setHashnodeConnecting] = useState(false);
  const [hashnodeDisconnecting, setHashnodeDisconnecting] = useState(false);
  const [hashnodeError, setHashnodeError] = useState("");


  useEffect(() => {
    fetch("/api/ai-settings")
      .then((res) => res.json())
      .then((data: AiSettingsData) => {
        setBaseUrl(data.baseUrl || "");
        setModel(data.model || "");
        setMaskedKey(data.apiKey || "");
        setScope(data.scope || "global");
        setApiKey("");
        setCustomInstructions(data.customInstructions || "");
        setCoachingStyle(data.coachingStyle || "balanced");
        setResponseLength(data.responseLength || "moderate");
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/integrations/hashnode")
      .then((res) => res.json())
      .then((data) => {
        setHashnodeConnected(data.connected ?? false);
        setHashnodeUsername(data.username ?? null);
      })
      .catch(console.error)
      .finally(() => setHashnodeLoading(false));
  }, []);

  const handleHashnodeConnect = async () => {
    const trimmed = hashnodeToken.trim();
    if (!trimmed) return;
    setHashnodeConnecting(true);
    setHashnodeError("");
    try {
      const res = await fetch("/api/integrations/hashnode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHashnodeError(data.error || "Failed to connect");
        return;
      }
      setHashnodeConnected(true);
      setHashnodeUsername(data.username ?? null);
      setHashnodeConnectOpen(false);
      setHashnodeToken("");
    } finally {
      setHashnodeConnecting(false);
    }
  };

  const handleHashnodeDisconnect = async () => {
    setHashnodeDisconnecting(true);
    try {
      await fetch("/api/integrations/hashnode", { method: "DELETE" });
      setHashnodeConnected(false);
      setHashnodeUsername(null);
      setHashnodeDisconnectOpen(false);
    } finally {
      setHashnodeDisconnecting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const body: Record<string, string> = {
      baseUrl,
      model,
      customInstructions,
      coachingStyle,
      responseLength,
    };
    if (apiKey) {
      body.apiKey = apiKey;
    }

    try {
      const res = await offlineFetch("/api/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data: AiSettingsData = await res.json();
        setMaskedKey(data.apiKey || "");
        setScope(data.scope || "global");
        setApiKey("");
        setCustomInstructions(data.customInstructions || "");
        setCoachingStyle(data.coachingStyle || "balanced");
        setResponseLength(data.responseLength || "moderate");
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="h-1 accent-gradient" />
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-accent" />
            <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
          </div>
        </div>

        {/* AI Provider Settings */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">AI Provider</h2>
            {scope === "user" && (
              <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                Per-user
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-text-muted">
                Configure any OpenAI-compatible provider (OpenRouter, Ollama, direct OpenAI, etc.).
                Settings are saved per-user when signed in, and override environment variables.
              </p>

              <div>
                <label htmlFor="settings-base-url" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Base URL
                </label>
                <Input
                  id="settings-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
                <p className="text-xs text-text-muted mt-1">
                  OpenAI-compatible API endpoint. Leave empty for direct OpenAI.
                </p>
              </div>

              <div>
                <label htmlFor="settings-api-key" className="block text-sm font-medium text-text-secondary mb-1.5">
                  API Key
                </label>
                <div className="relative">
                  <Input
                    id="settings-api-key"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={maskedKey || "sk-..."}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {maskedKey && !apiKey && (
                  <p className="text-xs text-text-muted mt-1">
                    Current key: {maskedKey}. Leave empty to keep it.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="settings-model" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Model
                </label>
                <Input
                  id="settings-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o, claude-sonnet-4-20250514, google/gemini-2.0-flash-001..."
                />
              </div>
            </div>
          )}
        </div>

        {/* AI Behavior Preferences */}
        {!loading && (
          <div className="glass-card p-6 mt-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-4 w-4 text-accent" />
              <h2 className="text-lg font-semibold text-text-primary">AI Behavior</h2>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-text-muted">
                Customize how the AI writing coach interacts with you. These preferences apply to chat, inline suggestions, and manuscript analysis.
              </p>

              <div>
                <label htmlFor="settings-coaching-style" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Coaching Style
                </label>
                <Select value={coachingStyle} onValueChange={setCoachingStyle}>
                  <SelectTrigger id="settings-coaching-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gentle">Gentle &mdash; encouraging, supportive feedback</SelectItem>
                    <SelectItem value="balanced">Balanced &mdash; honest but encouraging</SelectItem>
                    <SelectItem value="direct">Direct &mdash; candid, actionable feedback</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="settings-response-length" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Response Length
                </label>
                <Select value={responseLength} onValueChange={setResponseLength}>
                  <SelectTrigger id="settings-response-length">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concise">Concise &mdash; brief, to the point</SelectItem>
                    <SelectItem value="moderate">Moderate &mdash; balanced detail</SelectItem>
                    <SelectItem value="detailed">Detailed &mdash; thorough explanations</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="settings-custom-instructions" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Custom Instructions
                </label>
                <Textarea
                  id="settings-custom-instructions"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g., Focus on dialogue quality. I write literary fiction. Avoid clich&eacute;s..."
                  rows={3}
                />
                <p className="text-xs text-text-muted mt-1">
                  Additional instructions the AI will follow in all interactions. Be specific about your writing goals or preferences.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Hashnode Integration */}
        <div className="glass-card p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="h-4 w-4 text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">Hashnode</h2>
          </div>

          {hashnodeLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : hashnodeConnected ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">
                  Connected{hashnodeUsername ? ` as @${hashnodeUsername}` : ""}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  You can publish posts directly to Hashnode.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHashnodeDisconnectOpen(true)}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">Not connected</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Connect your Hashnode account to publish directly.
                </p>
              </div>
              <Button size="sm" onClick={() => { setHashnodeError(""); setHashnodeToken(""); setHashnodeConnectOpen(true); }}>
                Connect
              </Button>
            </div>
          )}
        </div>

        {/* Hashnode Connect Dialog */}
        <Dialog open={hashnodeConnectOpen} onOpenChange={setHashnodeConnectOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Connect Hashnode Account</DialogTitle>
              <DialogDescription>
                Paste your Hashnode Personal Access Token to link your account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label htmlFor="hashnode-token" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Personal Access Token
                </label>
                <Input
                  id="hashnode-token"
                  type="password"
                  value={hashnodeToken}
                  onChange={(e) => { setHashnodeToken(e.target.value); if (hashnodeError) setHashnodeError(""); }}
                  placeholder="Paste your token here"
                  onKeyDown={(e) => e.key === "Enter" && handleHashnodeConnect()}
                  disabled={hashnodeConnecting}
                />
                <p className="text-xs text-text-muted mt-1">
                  Generate a token in your Hashnode dashboard under Settings &rarr; Developer.
                </p>
              </div>
              {hashnodeError && (
                <p className="text-xs text-danger">{hashnodeError}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setHashnodeConnectOpen(false)} disabled={hashnodeConnecting}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleHashnodeConnect} disabled={hashnodeConnecting || !hashnodeToken.trim()}>
                  {hashnodeConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Hashnode Disconnect Confirmation */}
        <AlertDialog open={hashnodeDisconnectOpen} onOpenChange={setHashnodeDisconnectOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect Hashnode?</AlertDialogTitle>
              <AlertDialogDescription>
                Your access token will be removed. You won&apos;t be able to publish to Hashnode until you reconnect.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={hashnodeDisconnecting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleHashnodeDisconnect} disabled={hashnodeDisconnecting}>
                {hashnodeDisconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Save Button */}
        {!loading && (
          <div className="flex items-center gap-2 pt-2 mt-6">
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </Button>
          </div>
        )}

        {/* Hashnode Integration (detailed) */}
        {!loading && (
          <div className="glass-card p-6 mt-6">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="h-4 w-4 text-accent" />
              <h2 className="text-lg font-semibold text-text-primary">Hashnode</h2>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              Publish your stories directly to Hashnode. Uses a Personal Access Token from your Hashnode dashboard under Settings &rarr; Developer.
            </p>

            {hashnodeConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <span className="text-text-secondary">
                    Connected{hashnodeUsername ? ` as @${hashnodeUsername}` : ""}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleHashnodeDisconnect}
                  disabled={hashnodeDisconnecting}
                  className="gap-1.5"
                >
                  {hashnodeDisconnecting ? (
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
                    value={hashnodeToken}
                    onChange={(e) => setHashnodeToken(e.target.value)}
                    placeholder="Paste your Hashnode PAT"
                  />
                  <p className="text-xs text-text-muted mt-1">
                    Get it from your Hashnode dashboard: Settings &rarr; Developer &rarr; Personal Access Tokens
                  </p>
                </div>
                {hashnodeError && <p className="text-sm text-danger">{hashnodeError}</p>}
                <Button
                  onClick={handleHashnodeConnect}
                  disabled={hashnodeConnecting || !hashnodeToken.trim()}
                  className="gap-1.5"
                >
                  {hashnodeConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Connect Hashnode
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
