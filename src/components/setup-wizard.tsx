"use client";

import { useState, useEffect } from "react";
import { Eye, EyeOff, Save, Check, ArrowRight, ArrowLeft, BookOpen, MessageSquare, PenLine, Download, Sparkles, Key } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SetupWizardProps {
  userId?: string;
  onComplete: () => void;
}

const TOUR_FEATURES = [
  {
    icon: BookOpen,
    title: "Projects",
    description: "Organize your writing into projects with chapters, scenes, and story objects. Track characters, locations, and plot elements.",
  },
  {
    icon: PenLine,
    title: "Editor",
    description: "A distraction-free writing environment with rich text editing, version history, and annotations.",
  },
  {
    icon: MessageSquare,
    title: "AI Chat",
    description: "Get writing feedback, brainstorm ideas, and discuss your story with an AI assistant that knows your project context.",
  },
  {
    icon: Download,
    title: "Export",
    description: "Export your projects to Google Docs or JSON. Keep your work backed up and shareable.",
  },
];

export function SetupWizard({ userId, onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<"api-key" | "tour" | "done">("api-key");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      const body: Record<string, string> = { model };
      if (baseUrl) body.baseUrl = baseUrl;
      if (apiKey) body.apiKey = apiKey;
      const res = await offlineFetch("/api/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setStep("tour"), 800);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSkipKey = () => {
    setStep("tour");
  };

  const handleFinish = () => {
    const storageKey = userId
      ? `annie-setup-complete-${userId}`
      : "annie-setup-complete";
    localStorage.setItem(storageKey, "true");
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-surface-raised border border-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Progress indicator */}
        <div className="flex gap-1 px-6 pt-5">
          <div
            className={`h-1 flex-1 rounded-full transition-colors ${
              step === "api-key" ? "bg-accent" : "bg-accent"
            }`}
          />
          <div
            className={`h-1 flex-1 rounded-full transition-colors ${
              step === "tour" || step === "done" ? "bg-accent" : "bg-surface-overlay"
            }`}
          />
        </div>

        {step === "api-key" && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                <Key className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Welcome to Word Coach Annie
                </h2>
                <p className="text-sm text-text-muted">
                  Set up your AI provider to get started
                </p>
              </div>
            </div>

            <div className="space-y-4 mt-6">
              <p className="text-sm text-text-secondary">
                Annie uses any OpenAI-compatible API for AI features like chat,
                feedback, and brainstorming. Bring your own key from OpenRouter,
                OpenAI, Anthropic, or any compatible provider.
              </p>

              <div>
                <label
                  htmlFor="setup-base-url"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Base URL
                </label>
                <Input
                  id="setup-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://openrouter.ai/api/v1"
                />
                <p className="text-xs text-text-muted mt-1">
                  OpenAI-compatible endpoint. Leave empty for direct OpenAI.
                </p>
              </div>

              <div>
                <label
                  htmlFor="setup-api-key"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  API Key *
                </label>
                <div className="relative">
                  <Input
                    id="setup-api-key"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="setup-model"
                  className="block text-sm font-medium text-text-secondary mb-1.5"
                >
                  Model
                </label>
                <Input
                  id="setup-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o, claude-sonnet-4-20250514, etc."
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <button
                onClick={handleSkipKey}
                className="text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                Skip for now
              </button>
              <Button
                onClick={handleSaveKey}
                disabled={!apiKey.trim() || saving}
                className="gap-1.5"
              >
                {saving ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : saved ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Saving..." : saved ? "Saved!" : "Save & Continue"}
              </Button>
            </div>
          </div>
        )}

        {step === "tour" && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Quick Tour
                </h2>
                <p className="text-sm text-text-muted">
                  Here&apos;s what you can do with Annie
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
              {TOUR_FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="p-4 rounded-lg border border-border-subtle bg-surface hover:bg-surface-overlay transition-colors"
                >
                  <feature.icon className="h-5 w-5 text-accent mb-2" />
                  <h3 className="text-sm font-medium text-text-primary mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-text-muted leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <Button
                variant="ghost"
                onClick={() => setStep("api-key")}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleFinish} className="gap-1.5">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to check if the setup wizard should be shown.
 * Returns { showWizard, dismissWizard, loading, hasApiKey } state.
 */
export function useSetupWizard(userId?: string) {
  const [showWizard, setShowWizard] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storageKey = userId
      ? `annie-setup-complete-${userId}`
      : "annie-setup-complete";
    const dismissed = localStorage.getItem(storageKey) === "true";

    if (dismissed) {
      setLoading(false);
      return;
    }

    fetch("/api/ai-settings")
      .then((res) => res.json())
      .then((data) => {
        const configured = !!data.hasApiKey;
        setHasApiKey(configured);
        // Show wizard if user hasn't completed setup and has no API key
        if (!configured && !dismissed) {
          setShowWizard(true);
        }
      })
      .catch(() => {
        // On error, don't show wizard
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const dismissWizard = () => {
    setShowWizard(false);
  };

  return { showWizard, dismissWizard, loading, hasApiKey };
}
