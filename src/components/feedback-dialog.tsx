"use client";

import { useState } from "react";
import { MessageSquarePlus, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScreenshotAnnotation } from "@/components/screenshot-annotation";

type FeedbackType = "bug" | "feature" | "other";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail?: string;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  userEmail,
}: FeedbackDialogProps) {
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    issueUrl?: string;
  } | null>(null);

  // Screenshot state
  const [showScreenshotCapture, setShowScreenshotCapture] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);

  const reset = () => {
    setType("bug");
    setMessage("");
    setResult(null);
    setSubmitting(false);
    setShowScreenshotCapture(false);
    setScreenshotDataUrl(null);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: message.trim(),
          email: userEmail,
          screenshot: screenshotDataUrl ?? undefined,
          context: {
            url: window.location.href,
            userAgent: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
          },
        }),
      });

      if (res.ok) {
        const data: { issueUrl?: string } = await res.json();
        setResult({
          success: true,
          message: "Feedback submitted! Thank you.",
          issueUrl: data.issueUrl,
        });
        setMessage("");
        setScreenshotDataUrl(null);
      } else {
        const data: { error?: string } = await res.json().catch(() => ({}));
        setResult({
          success: false,
          message: data.error || "Failed to submit feedback. Please try again.",
        });
      }
    } catch {
      setResult({
        success: false,
        message: "Network error. Please check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5" />
            Send Feedback
          </DialogTitle>
          <DialogDescription>
            Report a bug, request a feature, or share your thoughts.
          </DialogDescription>
        </DialogHeader>

        {result?.success ? (
          <div className="py-4 text-center">
            <p className="text-sm text-text-secondary mb-3">{result.message}</p>
            {result.issueUrl && (
              <a
                href={result.issueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:underline"
              >
                View on GitHub
              </a>
            )}
            <div className="mt-4">
              <Button variant="outline" onClick={() => handleClose(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium text-text-secondary">
                  Type
                </label>
                <Select
                  value={type}
                  onValueChange={(v: string) => setType(v as FeedbackType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">Bug Report</SelectItem>
                    <SelectItem value="feature">Feature Request</SelectItem>
                    <SelectItem value="other">General Feedback</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary">
                  Message
                </label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    type === "bug"
                      ? "Describe what happened and what you expected..."
                      : type === "feature"
                        ? "Describe the feature you'd like to see..."
                        : "Share your thoughts..."
                  }
                  rows={5}
                  autoFocus
                />
              </div>

              {/* Screenshot section - shown for bug reports */}
              {type === "bug" && (
                <div>
                  <label className="text-sm font-medium text-text-secondary block mb-2">
                    Screenshot (optional)
                  </label>

                  {screenshotDataUrl && !showScreenshotCapture ? (
                    <div className="relative border border-border/20 rounded overflow-hidden bg-surface-raised">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={screenshotDataUrl}
                        alt="Bug report screenshot"
                        className="w-full rounded"
                      />
                      <div className="absolute top-2 right-2 flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowScreenshotCapture(true)}
                          title="Re-annotate"
                        >
                          <Camera className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setScreenshotDataUrl(null)}
                          title="Remove screenshot"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : showScreenshotCapture ? (
                    <ScreenshotAnnotation
                      onCapture={(dataUrl: string) => {
                        setScreenshotDataUrl(dataUrl);
                        setShowScreenshotCapture(false);
                      }}
                      onCancel={() => setShowScreenshotCapture(false)}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowScreenshotCapture(true)}
                    >
                      <Camera className="h-4 w-4 mr-1" />
                      Capture Screenshot
                    </Button>
                  )}
                </div>
              )}

              {result && !result.success && (
                <p className="text-sm text-danger">{result.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!message.trim() || submitting}
              >
                {submitting ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
