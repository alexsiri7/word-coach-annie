"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Check, Eye, EyeOff, Settings, Sparkles, MessageSquare, Link2, Link2Off, Loader2, Shield, Download, Trash2 } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AiModelSelect } from "@/components/ai-model-select";
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
  apiKey: string;
  model: string;
  hasApiKey?: boolean;
  scope?: "user" | "global";
  customInstructions?: string;
  coachingStyle?: string;
  responseLength?: string;
  chatWindowSize?: number;
  messagesUntilCompression?: number;
  compressionModel?: string;
}

export default function SettingsPage() {
  const router = useRouter();

  // AI settings state
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

  // Chat compression settings
  const [chatWindowSize, setChatWindowSize] = useState(5);
  const [messagesUntilCompression, setMessagesUntilCompression] = useState(15);
  const [compressionModel, setCompressionModel] = useState("");

  // Google Docs integration state
  const [googleDocsLoading, setGoogleDocsLoading] = useState(true);
  const [googleDocsConnected, setGoogleDocsConnected] = useState(false);
  const [googleDocsDisconnecting, setGoogleDocsDisconnecting] = useState(false);

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

  // Privacy & Data state
  const [replayAllowed, setReplayAllowed] = useState(true);
  const [consentLoading, setConsentLoading] = useState(true);
  const [exportingData, setExportingData] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Account deletion state
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai-settings")
      .then((res) => res.json())
      .then((data: AiSettingsData) => {
        setModel(data.model || "");
        setMaskedKey(data.apiKey || "");
        setScope(data.scope || "global");
        setApiKey("");
        setCustomInstructions(data.customInstructions || "");
        setCoachingStyle(data.coachingStyle || "balanced");
        setResponseLength(data.responseLength || "moderate");
        setChatWindowSize(data.chatWindowSize ?? 5);
        setMessagesUntilCompression(data.messagesUntilCompression ?? 15);
        setCompressionModel(data.compressionModel ?? "");
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

    fetch("/api/integrations/google-docs")
      .then((res) => res.json())
      .then((data) => setGoogleDocsConnected(data.connected ?? false))
      .catch(console.error)
      .finally(() => setGoogleDocsLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/account/consent")
      .then((res) => {
        if (!res.ok) throw new Error(`consent fetch failed: ${res.status}`);
        return res.json();
      })
      .then((rows: Array<{ feature: string; consentGiven: boolean }>) => {
        const replay = rows.find((r) => r.feature === "sentry_replay");
        setReplayAllowed(replay?.consentGiven ?? true);
      })
      .catch((err) => {
        console.error(err);
        setReplayAllowed(false); // fail closed: assume opted-out on error
      })
      .finally(() => setConsentLoading(false));
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
      const res = await fetch("/api/integrations/hashnode", { method: "DELETE", headers: { "X-CSRF-Protection": "1" } });
      if (!res.ok) throw new Error(`Hashnode disconnect failed: ${res.status}`);
      setHashnodeConnected(false);
      setHashnodeUsername(null);
      setHashnodeDisconnectOpen(false);
    } catch (err) {
      console.error("Failed to disconnect Hashnode", err);
    } finally {
      setHashnodeDisconnecting(false);
    }
  };

  const handleReplayToggle = async (allowed: boolean) => {
    const previous = replayAllowed;
    setReplayAllowed(allowed);
    localStorage.setItem("consent:sentry_replay", String(allowed));
    try {
      const res = await fetch("/api/account/consent", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
        body: JSON.stringify({ feature: "sentry_replay", consentGiven: allowed }),
      });
      if (!res.ok) throw new Error(`consent PUT failed: ${res.status}`);
    } catch (err) {
      console.error("Failed to save consent preference", err);
      setReplayAllowed(previous);
      localStorage.setItem("consent:sentry_replay", String(previous));
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    setExportError(null);
    try {
      const res = await fetch("/api/auth/export-data");
      if (!res.ok) {
        setExportError("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annie-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export failed. Please check your connection and try again.");
    } finally {
      setExportingData(false);
    }
  };

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const res = await offlineFetch("/api/auth/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
        body: JSON.stringify({ confirmEmail: confirmDeleteEmail }),
      });
      if (!res.ok) {
        const data = await res.json();
        setDeleteAccountError(data.error ?? "Deletion failed");
        return;
      }
      router.push("/");
    } catch {
      setDeleteAccountError("Network error. Please try again.");
    } finally {
      setDeletingAccount(false);
    }
  }

  const handleGoogleDocsDisconnect = async () => {
    setGoogleDocsDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/google-docs", { method: "DELETE", headers: { "X-CSRF-Protection": "1" } });
      if (!res.ok) throw new Error(`Google Docs disconnect failed: ${res.status}`);
      setGoogleDocsConnected(false);
    } catch (err) {
      console.error("Failed to disconnect Google Docs", err);
    } finally {
      setGoogleDocsDisconnecting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const body: Record<string, string | number> = {
      model,
      customInstructions,
      coachingStyle,
      responseLength,
      chatWindowSize,
      messagesUntilCompression,
      compressionModel,
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
        setChatWindowSize(data.chatWindowSize ?? 5);
        setMessagesUntilCompression(data.messagesUntilCompression ?? 15);
        setCompressionModel(data.compressionModel ?? "");
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
                Configure your Google Gemini API key and model.
                Settings are saved per-user when signed in, and override environment variables.
              </p>

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

              <AiModelSelect id="settings-model" value={model} onChange={setModel} />
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

        {/* Story Chat Settings */}
        {!loading && (
          <div className="glass-card p-6 mt-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="h-4 w-4 text-accent" />
              <h2 className="text-lg font-semibold text-text-primary">Story Chat</h2>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-text-muted">
                Control how the chat keeps context. The window is the number of recent messages
                sent verbatim; compression summarises older messages once the threshold is reached.
              </p>

              <div>
                <label htmlFor="settings-chat-window-size" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Messages kept verbatim
                </label>
                <Input
                  id="settings-chat-window-size"
                  type="number"
                  min={3}
                  max={20}
                  value={chatWindowSize}
                  onChange={(e) => setChatWindowSize(Number(e.target.value))}
                />
              </div>

              <div>
                <label htmlFor="settings-messages-until-compression" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Messages before compression
                </label>
                <Input
                  id="settings-messages-until-compression"
                  type="number"
                  min={5}
                  max={50}
                  value={messagesUntilCompression}
                  onChange={(e) => setMessagesUntilCompression(Number(e.target.value))}
                />
                <p className="text-xs text-text-muted mt-1">
                  A new summary is generated once this many messages accumulate beyond the window.
                </p>
              </div>

              <div>
                <label htmlFor="settings-compression-model" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Summarisation model
                </label>
                <Input
                  id="settings-compression-model"
                  value={compressionModel}
                  onChange={(e) => setCompressionModel(e.target.value)}
                  placeholder="gemini-2.0-flash-001 (leave empty to use main model)"
                />
                <p className="text-xs text-text-muted mt-1">
                  A cheaper/faster model for generating summaries. Leave empty to use the same model as chat.
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

        {/* Google Docs Integration */}
        {!loading && (
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

            {googleDocsLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : googleDocsConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <span className="text-text-secondary">Connected — Google Docs access granted</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGoogleDocsDisconnect}
                  disabled={googleDocsDisconnecting}
                  className="gap-1.5"
                >
                  {googleDocsDisconnecting ? (
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
        )}

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

        {/* Privacy & Data */}
        <div className="glass-card p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">Privacy & Data</h2>
          </div>
          {consentLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary">Session recording (Sentry replay)</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Anonymised recordings of errors to help fix bugs. Manuscript content is masked.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={replayAllowed}
                  onClick={() => handleReplayToggle(!replayAllowed)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    replayAllowed ? "bg-accent" : "bg-muted"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      replayAllowed ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm text-text-primary mb-1">Download your data</p>
                <p className="text-xs text-text-muted mb-3">
                  Export all your projects, settings, and account data as a ZIP file (GDPR Article 20).
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportData}
                  disabled={exportingData}
                  className="gap-1.5"
                >
                  {exportingData ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download my data
                </Button>
                {exportError && (
                  <p className="text-xs text-red-500 mt-2">{exportError}</p>
                )}
              </div>
              {scope === "user" && (
                <div className="border-t border-border pt-4">
                  <p className="text-sm text-text-primary mb-1">Delete your account</p>
                  <p className="text-xs text-text-muted mb-3">
                    Permanently deletes your account and all associated data. This cannot be undone (GDPR Article 17).
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setConfirmDeleteEmail(""); setDeleteAccountError(null); setDeleteAccountOpen(true); }}
                    className="gap-1.5 text-danger border-danger hover:bg-danger/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete my account
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delete Account Confirmation */}
        <AlertDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your account and all your data. Type your email address to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="px-1 py-2">
              <Input
                type="email"
                placeholder="Your email address"
                value={confirmDeleteEmail}
                onChange={(e) => setConfirmDeleteEmail(e.target.value)}
                autoComplete="off"
              />
              {deleteAccountError && (
                <p className="text-xs text-danger mt-2">{deleteAccountError}</p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteAccountOpen(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                disabled={deletingAccount || !confirmDeleteEmail.trim()}
                className="bg-danger hover:bg-danger/90"
              >
                {deletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete my account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}
