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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AiSettingsData {
  apiKey: string;
  model: string;
  hasApiKey?: boolean;
  scope?: "user" | "global";
}

interface GeminiModel {
  id: string;
  displayName: string;
}

export function AiSettingsDialog() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    fetch("/api/ai-settings")
      .then((res) => res.json())
      .then((data: AiSettingsData) => {
        setModel(data.model || "");
        setMaskedKey(data.apiKey || "");
        setApiKey("");
        setLoaded(true);
      })
      .catch(console.error);
  }, [open]);

  // Fetch model list once settings are loaded (requires a saved API key)
  useEffect(() => {
    if (!loaded) return;
    setModelsLoading(true);
    fetch("/api/ai-settings/models")
      .then((res) => res.json())
      .then((data: { models?: GeminiModel[]; error?: string }) => {
        if (data.models) setModels(data.models);
      })
      .catch(console.error)
      .finally(() => setModelsLoading(false));
  }, [loaded]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const body: Record<string, string> = { model };
    if (apiKey) body.apiKey = apiKey;

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
          <DialogTitle>AI Settings</DialogTitle>
        </DialogHeader>
        {!loaded ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <p className="text-xs text-text-muted">
              Configure your Google AI (Gemini) API key and model.
              Settings override environment variables.
            </p>

            <div>
              <label htmlFor="ai-api-key" className="block text-sm font-medium text-text-secondary mb-1.5">
                Google AI API Key
              </label>
              <div className="relative">
                <Input
                  id="ai-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={maskedKey || "AIza..."}
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
                {modelsLoading && (
                  <span className="ml-2 inline-block h-3 w-3 border border-text-muted border-t-transparent rounded-full animate-spin align-middle" />
                )}
              </label>
              {models.length > 0 ? (
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="ai-model">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id}
                        {m.displayName !== m.id && (
                          <span className="text-text-muted ml-1 text-xs">— {m.displayName}</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="ai-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gemini-2.0-flash"
                />
              )}
              {!modelsLoading && models.length === 0 && (
                <p className="text-xs text-text-muted mt-1">
                  Save a valid API key to load models from Google.
                </p>
              )}
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
