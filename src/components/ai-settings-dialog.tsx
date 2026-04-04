"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Check, Eye, EyeOff } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AiSettingsData } from "@/lib/api-schemas";

export function AiSettingsDialog() {
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    fetch("/api/ai-settings")
      .then((res) => res.json())
      .then((data: AiSettingsData) => {
        setBaseUrl(data.baseUrl || "");
        setModel(data.model || "");
        setMaskedKey(data.apiKey || "");
        setApiKey(""); // Don't pre-fill with masked value
        setLoaded(true);
      })
      .catch(console.error);
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const body: Record<string, string> = {
      baseUrl,
      model,
    };
    // Only send apiKey if user actually typed a new one
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
        const data = await res.json();
        setMaskedKey(data.apiKey || "");
        setApiKey("");
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-text-muted hover:text-text-primary"
          title="AI Settings"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>AI Provider Settings</DialogTitle>
        </DialogHeader>
        {!loaded ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <p className="text-xs text-text-muted">
              Configure any OpenAI-compatible provider (OpenRouter, Ollama, direct OpenAI, etc.).
              Settings override environment variables.
            </p>

            <div>
              <label htmlFor="ai-base-url" className="block text-sm font-medium text-text-secondary mb-1.5">
                Base URL
              </label>
              <Input
                id="ai-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-text-muted mt-1">
                OpenAI-compatible API endpoint. Leave empty for direct OpenAI.
              </p>
            </div>

            <div>
              <label htmlFor="ai-api-key" className="block text-sm font-medium text-text-secondary mb-1.5">
                API Key
              </label>
              <div className="relative">
                <Input
                  id="ai-api-key"
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
              <label htmlFor="ai-model" className="block text-sm font-medium text-text-secondary mb-1.5">
                Model
              </label>
              <Input
                id="ai-model"
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
      </DialogContent>
    </Dialog>
  );
}
