import { useState, useEffect } from "react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import { DEFAULT_COMPRESSION, DEFAULT_PREFERENCES } from "@/lib/ai/settings-defaults";

export interface AiSettingsData {
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

export interface AiSettingsForm {
  apiKey: string;
  model: string;
  customInstructions: string;
  coachingStyle: string;
  responseLength: string;
  chatWindowSize: number;
  messagesUntilCompression: number;
  compressionModel: string;
}

export function toAiSettingsState(data: AiSettingsData) {
  const form: AiSettingsForm = {
    apiKey: "",
    model: data.model || "",
    customInstructions: data.customInstructions || DEFAULT_PREFERENCES.customInstructions,
    coachingStyle: data.coachingStyle || DEFAULT_PREFERENCES.coachingStyle,
    responseLength: data.responseLength || DEFAULT_PREFERENCES.responseLength,
    chatWindowSize: data.chatWindowSize ?? DEFAULT_COMPRESSION.chatWindowSize,
    messagesUntilCompression: data.messagesUntilCompression ?? DEFAULT_COMPRESSION.messagesUntilCompression,
    compressionModel: data.compressionModel ?? DEFAULT_COMPRESSION.compressionModel,
  };
  return { form, maskedKey: data.apiKey || "", scope: data.scope || "global" };
}

export function useAiSettings() {
  const [form, setForm] = useState(() => toAiSettingsState({ apiKey: "", model: "" }).form);
  const [maskedKey, setMaskedKey] = useState("");
  const [scope, setScope] = useState<"user" | "global">("global");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai-settings")
      .then((res) => res.json())
      .then((data: AiSettingsData) => {
        const next = toAiSettingsState(data);
        setForm(next.form);
        setMaskedKey(next.maskedKey);
        setScope(next.scope);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const setField = <K extends keyof AiSettingsForm>(key: K, value: AiSettingsForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const { apiKey, ...settings } = form;
    const body: Record<string, string | number> = settings;
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
        const next = toAiSettingsState(await res.json());
        // Unlike the initial load, a save leaves the selected model as the user left it.
        setForm((prev) => ({ ...next.form, model: prev.model }));
        setMaskedKey(next.maskedKey);
        setScope(next.scope);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setSaveError(data.error ?? "Save failed. Please try again.");
      }
    } catch {
      setSaveError("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return { loading, scope, maskedKey, form, setField, saving, saved, saveError, save };
}

export type AiSettings = ReturnType<typeof useAiSettings>;
