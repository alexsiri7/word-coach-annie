"use client";

import { useState, useEffect, useCallback } from "react";
import { Share2, X, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface ShareEntry {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

interface ShareDialogProps {
  projectId: string;
  projectTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({
  projectId,
  projectTitle,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/share`);
      if (res.ok) {
        const data = await res.json();
        setShares(data);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      fetchShares();
      setEmail("");
      setError("");
      setCopied(false);
    }
  }, [open, fetchShares]);

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleAdd = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setError("Please enter a valid email address");
      return;
    }
    setError("");
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.status === 409) {
        setError("This email already has access");
        return;
      }
      if (!res.ok) {
        setError("Failed to add reader");
        return;
      }
      setEmail("");
      setError("");
      fetchShares();
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (shareEmail: string, shareId: string) => {
    setRemovingId(shareId);
    try {
      await fetch(`/api/projects/${projectId}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: shareEmail }),
      });
      fetchShares();
    } finally {
      setRemovingId(null);
    }
  };

  const readerUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/read/${projectId}`
      : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(readerUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Project</DialogTitle>
          <DialogDescription className="truncate">
            {projectTitle}
          </DialogDescription>
        </DialogHeader>

        {/* Add reader */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Add Reader
          </label>
          <div className="flex gap-2">
            <Input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              placeholder="Enter email address"
              type="email"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              disabled={adding}
            />
            <Button
              onClick={handleAdd}
              disabled={adding || !email.trim()}
              size="sm"
              className="shrink-0"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Add"
              )}
            </Button>
          </div>
          {error && (
            <p className="text-xs text-danger">{error}</p>
          )}
        </div>

        {/* Current readers */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Readers
          </label>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
            </div>
          ) : shares.length === 0 ? (
            <p className="text-sm text-text-muted py-3 text-center">
              No readers yet
            </p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-overlay/50"
                >
                  <span className="text-sm text-text-secondary truncate">
                    {share.email}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-text-muted hover:text-danger"
                    onClick={() => handleRemove(share.email, share.id)}
                    disabled={removingId === share.id}
                    aria-label={`Remove ${share.email}`}
                  >
                    {removingId === share.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reader link */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Reader Link
          </label>
          <div className="flex gap-2">
            <Input
              value={readerUrl}
              readOnly
              className="text-xs font-mono"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Convenience share button to use in headers */
export function ShareButton({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label="Share project"
      >
        <Share2 className="h-4 w-4" />
      </Button>
      <ShareDialog
        projectId={projectId}
        projectTitle={projectTitle}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
