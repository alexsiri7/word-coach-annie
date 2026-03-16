"use client";

import { useState, useEffect } from "react";
import {
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  PenLine,
  MessageSquare,
  FileText,
  BookOpen,
  Sparkles,
  Key,
} from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const DISMISSED_KEY = "setup-wizard-dismissed";

const FEATURES = [
  {
    icon: BookOpen,
    title: "Projects",
    description:
      "Organize your writing into projects with chapters, scenes, and story objects like characters and locations.",
  },
  {
    icon: PenLine,
    title: "Editor",
    description:
      "A distraction-free writing environment with version history, annotations, and focus mode.",
  },
  {
    icon: MessageSquare,
    title: "AI Chat",
    description:
      "Chat with an AI assistant about your story — brainstorm ideas, get feedback, or work through plot problems.",
  },
  {
    icon: FileText,
    title: "Export",
    description:
      "Export your manuscript as a formatted document. Generate story bibles and per-chapter summaries.",
  },
];

export function SetupWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0); // 0 = welcome/api-key, 1 = tour, 2 = done
  const [loading, setLoading] = useState(true);

  // API key form state
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Check if wizard was previously dismissed
    if (localStorage.getItem(DISMISSED_KEY)) {
      setLoading(false);
      return;
    }

    // Check if setup is already complete
    fetch("/api/setup-status")
      .then((res) => res.json())
      .then((data) => {
        if (!data.setupComplete) {
          setOpen(true);
        }
      })
      .catch(() => {
        // If we can't check, don't block the user
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setSaved(false);

    try {
      const body: Record<string, string> = { baseUrl, model };
      body.apiKey = apiKey;

      const res = await offlineFetch("/api/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSaved(true);
        // Auto-advance to tour after a brief delay
        setTimeout(() => setStep(1), 800);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSkipKey = () => {
    setStep(1);
  };

  const handleFinish = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setOpen(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setOpen(false);
  };

  if (loading) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        {step === 0 && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Key className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Welcome to Word Coach Annie</DialogTitle>
                  <DialogDescription className="mt-1">
                    Set up your AI provider to unlock chat, feedback, and brainstorming features.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <p className="text-xs text-text-muted">
                Bring your own API key from any OpenAI-compatible provider (OpenRouter, OpenAI, Ollama, etc.).
                Your key is encrypted and stored locally.
              </p>

              <div>
                <label htmlFor="setup-api-key" className="block text-sm font-medium text-text-secondary mb-1.5">
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
                    onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
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
              </div>

              <div>
                <label htmlFor="setup-base-url" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Base URL
                </label>
                <Input
                  id="setup-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
                <p className="text-xs text-text-muted mt-1">
                  OpenAI-compatible API endpoint. Leave empty for direct OpenAI.
                </p>
              </div>

              <div>
                <label htmlFor="setup-model" className="block text-sm font-medium text-text-secondary mb-1.5">
                  Model
                </label>
                <Input
                  id="setup-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o, claude-sonnet-4-20250514, gemini-2.0-flash..."
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={handleSkipKey} className="text-text-muted">
                  Skip for now
                </Button>
                <Button onClick={handleSaveKey} disabled={saving || !apiKey.trim()} className="gap-1.5">
                  {saving ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : saved ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {saving ? "Saving..." : saved ? "Saved!" : "Continue"}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Quick Tour</DialogTitle>
                  <DialogDescription className="mt-1">
                    Here&apos;s what you can do with Word Coach Annie.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-3 pt-2">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="flex items-start gap-3 p-3 rounded-lg bg-surface-raised border border-border"
                >
                  <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <feature.icon className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">{feature.title}</h3>
                    <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3">
              <Button variant="ghost" onClick={() => setStep(0)} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button onClick={handleFinish} className="gap-1.5">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
