"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GeminiModel {
  id: string;
  displayName: string;
}

export interface AiModelSelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

export function AiModelSelect({ value, onChange, id = "ai-model" }: AiModelSelectProps) {
  const [models, setModels] = useState<GeminiModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  useEffect(() => {
    setModelsLoading(true);
    fetch("/api/ai-settings/models")
      .then((res) => res.json())
      .then((data: { models?: GeminiModel[]; error?: string }) => {
        if (data.models) setModels(data.models);
      })
      .catch(console.error)
      .finally(() => setModelsLoading(false));
  }, []);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text-secondary mb-1.5">
        Model
        {modelsLoading && (
          <span className="ml-2 inline-block h-3 w-3 border border-text-muted border-t-transparent rounded-full animate-spin align-middle" />
        )}
      </label>
      {models.length > 0 ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id}>
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
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="gemini-2.0-flash"
        />
      )}
      {!modelsLoading && models.length === 0 && (
        <p className="text-xs text-text-muted mt-1">
          Save a valid API key to load models from Google.
        </p>
      )}
    </div>
  );
}
