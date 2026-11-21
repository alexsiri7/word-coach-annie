"use client";

import { useState } from "react";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AiModelSelect } from "@/components/ai-model-select";
import type { AiSettings } from "./use-ai-settings";

export function AiProviderSection({ ai }: { ai: AiSettings }) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-4 w-4 text-accent" />
        <h2 className="text-lg font-semibold text-text-primary">AI Provider</h2>
        {ai.scope === "user" && (
          <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full">
            Per-user
          </span>
        )}
      </div>

      {ai.loading ? (
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
                value={ai.form.apiKey}
                onChange={(e) => ai.setField("apiKey", e.target.value)}
                placeholder={ai.maskedKey || "sk-..."}
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
            {ai.maskedKey && !ai.form.apiKey && (
              <p className="text-xs text-text-muted mt-1">
                Current key: {ai.maskedKey}. Leave empty to keep it.
              </p>
            )}
          </div>

          <AiModelSelect id="settings-model" value={ai.form.model} onChange={(model) => ai.setField("model", model)} />
        </div>
      )}
    </div>
  );
}
