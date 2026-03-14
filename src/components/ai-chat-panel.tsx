"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface AIChatPanelProps {
  projectId: string;
  sceneContext?: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-surface-sunken rounded p-2 my-1 text-xs overflow-x-auto"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-surface-sunken px-1 rounded text-xs">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold mt-2 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-semibold text-sm mt-2 mb-1">$1</h3>')
    .replace(/^- (.+)$/gm, '<li class="ml-3">• $1</li>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, "<br/>");
}

export function AIChatPanel({ projectId, sceneContext }: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // Load chat history
  useEffect(() => {
    fetch(`/api/chat?projectId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) setMessages(data.messages);
      })
      .catch(console.error);
  }, [projectId]);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    setIsStreaming(true);
    setStreamingContent("");

    // Optimistically add user message
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, message: text, sceneContext }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                accumulated += parsed.content;
                setStreamingContent(accumulated);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }

      // Add completed assistant message
      const assistantMsg: ChatMessage = {
        id: `temp-${Date.now()}-assistant`,
        role: "assistant",
        content: accumulated,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent("");
    } catch (err) {
      console.error("Chat error:", err);
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setStreamingContent("");
    } finally {
      setIsStreaming(false);
    }
  };

  const clearHistory = async () => {
    await fetch(`/api/chat?projectId=${projectId}`, { method: "DELETE" });
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
          AI Assistant
        </span>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-text-muted hover:text-danger"
            onClick={clearHistory}
            title="Clear chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-sm text-text-muted mb-2">
              Ask about your story — plot, characters, pacing, ideas...
            </p>
            <div className="space-y-1.5 w-full">
              {[
                "What are the main themes so far?",
                "Suggest a conflict for this scene",
                "How can I improve the pacing?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-surface-overlay/40 text-text-secondary hover:bg-surface-overlay hover:text-text-primary transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-accent/20 text-text-primary"
                  : "bg-surface-overlay text-text-secondary"
              )}
            >
              {msg.role === "assistant" ? (
                <div
                  className="prose-chat [&_pre]:my-1 [&_li]:list-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
            <span className="text-[10px] text-text-muted mt-0.5 px-1">
              {formatTime(msg.createdAt)}
            </span>
          </div>
        ))}

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <div className="flex flex-col items-start">
            <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-surface-overlay text-text-secondary">
              <div
                className="prose-chat [&_pre]:my-1 [&_li]:list-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }}
              />
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isStreaming && !streamingContent && (
          <div className="flex items-start">
            <div className="rounded-lg px-3 py-2 bg-surface-overlay">
              <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your story..."
            rows={1}
            className="flex-1 resize-none bg-surface-overlay rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted border border-border focus:outline-none focus:ring-1 focus:ring-accent max-h-24 overflow-y-auto"
            style={{ minHeight: "36px" }}
            disabled={isStreaming}
          />
          <Button
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
