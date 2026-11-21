"use client";

import { MessageSquare } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AiSettings } from "./use-ai-settings";

export function AiBehaviorSection({ ai }: { ai: AiSettings }) {
  return (
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
          <Select value={ai.form.coachingStyle} onValueChange={(value) => ai.setField("coachingStyle", value)}>
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
          <Select value={ai.form.responseLength} onValueChange={(value) => ai.setField("responseLength", value)}>
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
            value={ai.form.customInstructions}
            onChange={(e) => ai.setField("customInstructions", e.target.value)}
            placeholder="e.g., Focus on dialogue quality. I write literary fiction. Avoid clich&eacute;s..."
            rows={3}
          />
          <p className="text-xs text-text-muted mt-1">
            Additional instructions the AI will follow in all interactions. Be specific about your writing goals or preferences.
          </p>
        </div>
      </div>
    </div>
  );
}
