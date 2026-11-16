"use client";

import { MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { AiSettings } from "./use-ai-settings";

export function ChatCompressionSection({ ai }: { ai: AiSettings }) {
  return (
    <div className="glass-card p-6 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-accent" />
        <h2 className="text-lg font-semibold text-text-primary">Story Chat</h2>
      </div>

      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          Control how the chat keeps context. The window is the number of recent messages
          sent verbatim; compression summarises older messages once the threshold is reached.
        </p>

        <div>
          <label htmlFor="settings-chat-window-size" className="block text-sm font-medium text-text-secondary mb-1.5">
            Messages kept verbatim
          </label>
          <Input
            id="settings-chat-window-size"
            type="number"
            min={3}
            max={20}
            value={ai.form.chatWindowSize}
            onChange={(e) => ai.setField("chatWindowSize", Number(e.target.value))}
          />
        </div>

        <div>
          <label htmlFor="settings-messages-until-compression" className="block text-sm font-medium text-text-secondary mb-1.5">
            Messages before compression
          </label>
          <Input
            id="settings-messages-until-compression"
            type="number"
            min={5}
            max={50}
            value={ai.form.messagesUntilCompression}
            onChange={(e) => ai.setField("messagesUntilCompression", Number(e.target.value))}
          />
          <p className="text-xs text-text-muted mt-1">
            A new summary is generated once this many messages accumulate beyond the window.
          </p>
        </div>

        <div>
          <label htmlFor="settings-compression-model" className="block text-sm font-medium text-text-secondary mb-1.5">
            Summarisation model
          </label>
          <Input
            id="settings-compression-model"
            value={ai.form.compressionModel}
            onChange={(e) => ai.setField("compressionModel", e.target.value)}
            placeholder="gemini-2.0-flash-001 (leave empty to use main model)"
          />
          <p className="text-xs text-text-muted mt-1">
            A cheaper/faster model for generating summaries. Leave empty to use the same model as chat.
          </p>
        </div>
      </div>
    </div>
  );
}
