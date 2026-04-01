"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Check, Eye, EyeOff, Settings, Sparkles } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AiSettingsData {
  baseUrl: string;
  apiKey: string;
  model: string;
  hasApiKey?: boolean;
  scope?: "user" | "global";
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

  useEffect(() => {
    fetch("/api/ai-settings")
      .then((res) => res.json())
      .then((data: AiSettingsData) => {
        setBaseUrl(data.baseUrl || "");
        setModel(data.model || "");
        setMaskedKey(data.apiKey || "");
        setScope(data.scope || "global");
        setApiKey("");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const body: Record<string, string> = {
      baseUrl,
      model,
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

              <div className="flex items-center gap-2 pt-2">
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
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
