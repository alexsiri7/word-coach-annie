"use client";

import { Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiSettings } from "./use-ai-settings";

export function AiSettingsSaveBar({ ai }: { ai: AiSettings }) {
  return (
    <div className="flex items-center gap-2 pt-2 mt-6">
      <Button onClick={ai.save} disabled={ai.saving} className="gap-1.5">
        {ai.saving ? (
          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : ai.saved ? (
          <Check className="h-4 w-4" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {ai.saving ? "Saving..." : ai.saved ? "Saved!" : "Save"}
      </Button>
      {ai.saveError && <p className="text-xs text-red-500">{ai.saveError}</p>}
    </div>
  );
}
