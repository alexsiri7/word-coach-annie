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

  // Medium integration state
  const [mediumConnected, setMediumConnected] = useState(false);
  const [mediumUsername, setMediumUsername] = useState<string | null>(null);
  const [mediumLoading, setMediumLoading] = useState(true);
  const [mediumConnectOpen, setMediumConnectOpen] = useState(false);
  const [mediumToken, setMediumToken] = useState("");
  const [mediumConnecting, setMediumConnecting] = useState(false);
  const [mediumDisconnecting, setMediumDisconnecting] = useState(false);
  const [mediumError, setMediumError] = useState("");
  const [mediumConfirmDisconnect, setMediumConfirmDisconnect] = useState(false);

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

    fetch("/api/integrations/medium")
      .then((res) => res.json())
      .then((data) => {
        setMediumConnected(data.connected || false);
        setMediumUsername(data.username || null);
      })
      .catch(console.error)
      .finally(() => setMediumLoading(false));
  }, []);

  const handleMediumConnect = async () => {
    const token = mediumToken.trim();
    if (!token) return;
    setMediumConnecting(true);
    setMediumError("");
    try {
      const res = await fetch("/api/integrations/medium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMediumError(data.error || "Failed to connect");
        return;
      }
      setMediumConnected(true);
      setMediumUsername(data.username || null);
      setMediumToken("");
      setMediumConnectOpen(false);
    } finally {
      setMediumConnecting(false);
    }
  };

  const handleMediumDisconnect = async () => {
    setMediumDisconnecting(true);
    try {
      await fetch("/api/integrations/medium", { method: "DELETE" });
      setMediumConnected(false);
      setMediumUsername(null);
      setMediumConfirmDisconnect(false);
    } finally {
      setMediumDisconnecting(false);
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

        {/* Medium Integration */}
        <div className="glass-card p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Link2 className="h-4 w-4 text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">Medium</h2>
          </div>

          {mediumLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : mediumConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                Connected as{" "}
                <span className="font-medium text-text-primary">@{mediumUsername}</span>
              </p>
              {mediumConfirmDisconnect ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-muted">Remove Medium connection?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleMediumDisconnect}
                    disabled={mediumDisconnecting}
                    className="gap-1.5"
                  >
                    {mediumDisconnecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2Off className="h-3.5 w-3.5" />
                    )}
                    Disconnect
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMediumConfirmDisconnect(false)}
                    disabled={mediumDisconnecting}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMediumConfirmDisconnect(true)}
                  className="gap-1.5"
                >
                  <Link2Off className="h-3.5 w-3.5" />
                  Disconnect
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-text-muted">
                Not connected. Connect your Medium account to publish directly from Word Coach Annie.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMediumToken("");
                  setMediumError("");
                  setMediumConnectOpen(true);
                }}
                className="gap-1.5"
              >
                <Link2 className="h-3.5 w-3.5" />
                Connect Medium
              </Button>
            </div>
          )}
        </div>

        {/* Medium Connect Dialog */}
        <Dialog
          open={mediumConnectOpen}
          onOpenChange={(open) => {
            setMediumConnectOpen(open);
            if (!open) {
              setMediumToken("");
              setMediumError("");
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Connect Medium</DialogTitle>
              <DialogDescription>
                Paste your Medium integration token to link your account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label htmlFor="medium-token" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Integration Token
                </label>
                <Input
                  id="medium-token"
                  type="password"
                  value={mediumToken}
                  onChange={(e) => {
                    setMediumToken(e.target.value);
                    if (mediumError) setMediumError("");
                  }}
                  placeholder="Paste your integration token"
                  onKeyDown={(e) => e.key === "Enter" && handleMediumConnect()}
                  disabled={mediumConnecting}
                />
                <p className="text-xs text-text-muted mt-1">
                  Get your integration token from{" "}
                  <a
                    href="https://medium.com/me/settings/security"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline"
                  >
                    medium.com/me/settings/security
                  </a>
                </p>
              </div>
              {mediumError && (
                <p className="text-xs text-danger">{mediumError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMediumConnectOpen(false)}
                  disabled={mediumConnecting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleMediumConnect}
                  disabled={mediumConnecting || !mediumToken.trim()}
                  className="gap-1.5"
                >
                  {mediumConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Connect
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
      </div>
    </main>
  );
}
