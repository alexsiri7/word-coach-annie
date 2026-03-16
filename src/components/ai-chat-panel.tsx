"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Trash2, Loader2, ChevronDown, ChevronRight, Wrench, WifiOff, Key } from "lucide-react";
import { offlineFetch } from "@/lib/offline/sync-queue";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";
import { cn } from "@/lib/utils";
import { sanitizeMessageContent } from "@/lib/sanitize";
import { useNetworkStatus } from "@/lib/offline/use-network-status";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ToolActivity {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: "running" | "done";
  summary?: string;
}

interface AIChatPanelProps {
  projectId: string;
  sceneContext?: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Formats a tool name for display: read_scene_content -> Read scene content */
function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function ToolActivityCard({ activity }: { activity: ToolActivity }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = activity.status === "running";

  return (
    <div className="flex flex-col gap-0.5 text-xs text-text-muted">
      <button
        onClick={() => !isRunning && setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded bg-surface-sunken/50 text-left",
          !isRunning && "hover:bg-surface-sunken cursor-pointer",
          isRunning && "cursor-default"
        )}
      >
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0 text-accent" />
        ) : (
          <>
            <Wrench className="h-3 w-3 flex-shrink-0 text-text-muted/70" />
            {activity.summary ? (
              expanded ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />
            ) : null}
          </>
        )}
        <span className={cn(isRunning && "text-accent")}>
          {formatToolName(activity.name)}
        </span>
      </button>
      {expanded && activity.summary && (
        <div className="ml-5 px-2 py-1 rounded bg-surface-sunken/30 text-text-muted/80 break-words">
          {activity.summary}
        </div>
      )}
    </div>
  );
}

export function AIChatPanel({ projectId, sceneContext }: AIChatPanelProps) {
  const { isOnline } = useNetworkStatus();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check if AI is configured
  const refreshAiStatus = useCallback(() => {
    fetch("/api/ai-settings")
      .then((res) => res.json())
      .then((data) => setHasApiKey(!!data.hasApiKey))
      .catch(() => setHasApiKey(false));
  }, []);

  useEffect(() => {
    refreshAiStatus();
  }, [refreshAiStatus]);

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
      .catch(console.error)
      .finally(() => setLoadingHistory(false));
  }, [projectId]);

  // Scroll on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, toolActivities, scrollToBottom]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming || !isOnline) return;

    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setToolActivities([]);

    // Optimistically add user message
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await offlineFetch("/api/chat", {
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
              if (parsed.type === "tool_call") {
                const activity: ToolActivity = {
                  id: `tool-${Date.now()}-${parsed.name}`,
                  name: parsed.name,
                  args: parsed.args,
                  status: "running",
                };
                setToolActivities((prev) => [...prev, activity]);
              } else if (parsed.type === "tool_result") {
                setToolActivities((prev) =>
                  prev.map((t) =>
                    t.name === parsed.name && t.status === "running"
                      ? { ...t, status: "done", summary: parsed.summary }
                      : t
                  )
                );
              } else if (parsed.type === "content" || parsed.content) {
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
    await offlineFetch(`/api/chat?projectId=${projectId}`, { method: "DELETE" });
    setMessages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter (without Shift) or Cmd/Ctrl+Enter sends the message
    if (e.key === "Enter" && (!e.shiftKey || e.metaKey || e.ctrlKey)) {
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
        <div className="flex items-center gap-1">
          <AiSettingsDialog onSaved={refreshAiStatus} />
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-text-muted hover:text-danger"
              onClick={clearHistory}
              aria-label="Clear chat history"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Offline notice */}
      {!isOnline && (
        <div className="mx-3 mb-1 flex items-center gap-2 rounded-lg bg-yellow-900/30 border border-yellow-800/40 px-3 py-2 text-xs text-yellow-200">
          <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
          <span>AI features require an internet connection</span>
        </div>
      )}

      {/* No API key configured */}
      {hasApiKey === false && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
            <Key className="h-6 w-6 text-accent" />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">
            AI not configured
          </p>
          <p className="text-xs text-text-muted mb-4 max-w-[240px]">
            Add your API key in settings to enable AI chat, feedback, and brainstorming.
          </p>
          <AiSettingsDialog onSaved={refreshAiStatus} />
        </div>
      )}

      {/* Messages */}
      {hasApiKey !== false && <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 space-y-3" aria-live="polite" aria-label="Chat messages">
        {loadingHistory && (
          <div className="space-y-3 animate-pulse">
            <div className="flex flex-col items-end">
              <div className="max-w-[90%] rounded-lg px-3 py-2 bg-accent/20 h-8 w-48" />
              <div className="h-2.5 w-10 bg-surface-overlay rounded mt-1 mr-1" />
            </div>
            <div className="flex flex-col items-start">
              <div className="max-w-[90%] rounded-lg px-3 py-2 bg-surface-overlay h-16 w-56" />
              <div className="h-2.5 w-10 bg-surface-overlay rounded mt-1 ml-1" />
            </div>
            <div className="flex flex-col items-end">
              <div className="max-w-[90%] rounded-lg px-3 py-2 bg-accent/20 h-8 w-36" />
              <div className="h-2.5 w-10 bg-surface-overlay rounded mt-1 mr-1" />
            </div>
          </div>
        )}

        {!loadingHistory && messages.length === 0 && !isStreaming && (
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
                <div className="prose-chat [&_pre]:my-1 [&_li]:list-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      pre: ({ children }: { children?: React.ReactNode }) => <pre className="bg-surface-sunken rounded p-2 my-1 text-xs overflow-x-auto">{children}</pre>,
                      code: ({ children, className }: { children?: React.ReactNode; className?: string }) => className
                        ? <code className={className}>{children}</code>
                        : <code className="bg-surface-sunken px-1 rounded text-xs">{children}</code>,
                      h2: ({ children }) => <h3 className="font-semibold text-sm mt-2 mb-1">{children}</h3>,
                      h3: ({ children }) => <h4 className="font-semibold mt-2 mb-1">{children}</h4>,
                    }}
                  >
                    {sanitizeMessageContent(msg.content)}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{sanitizeMessageContent(msg.content)}</p>
              )}
            </div>
            <span className="text-[10px] text-text-muted mt-0.5 px-1">
              {formatTime(msg.createdAt)}
            </span>
          </div>
        ))}

        {/* Tool activity indicators */}
        {isStreaming && toolActivities.length > 0 && (
          <div className="flex flex-col items-start">
            <div className="max-w-[90%] space-y-1">
              {toolActivities.map((activity) => (
                <ToolActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        )}

        {/* Streaming message */}
        {isStreaming && streamingContent && (
          <div className="flex flex-col items-start">
            <div className="max-w-[90%] rounded-lg px-3 py-2 text-sm bg-surface-overlay text-text-secondary">
              <div className="prose-chat [&_pre]:my-1 [&_li]:list-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    pre: ({ children }) => <pre className="bg-surface-sunken rounded p-2 my-1 text-xs overflow-x-auto">{children}</pre>,
                    code: ({ children, className }) => className
                      ? <code className={className}>{children}</code>
                      : <code className="bg-surface-sunken px-1 rounded text-xs">{children}</code>,
                    h2: ({ children }: { children?: React.ReactNode }) => <h3 className="font-semibold text-sm mt-2 mb-1">{children}</h3>,
                    h3: ({ children }: { children?: React.ReactNode }) => <h4 className="font-semibold mt-2 mb-1">{children}</h4>,
                  }}
                >
                  {sanitizeMessageContent(streamingContent)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isStreaming && !streamingContent && toolActivities.length === 0 && (
          <div className="flex items-start">
            <div className="rounded-lg px-3 py-2 bg-surface-overlay">
              <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
            </div>
          </div>
        )}
      </div>}

      {/* Input area */}
      {hasApiKey !== false && (
        <div className="border-t border-border p-2">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isOnline ? "Ask about your story..." : "AI chat unavailable offline"}
              aria-label="Chat message"
              rows={1}
              className="flex-1 resize-none bg-surface-overlay rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted border border-border focus:outline-none focus:ring-1 focus:ring-accent max-h-24 overflow-y-auto"
              style={{ minHeight: "36px" }}
              disabled={isStreaming || !isOnline}
            />
            <Button
              size="icon"
              className="h-9 w-9 flex-shrink-0"
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming || !isOnline}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
