"use client";

import { useState, useCallback } from "react";
import { MessageSquarePlus, Camera, X, Pencil } from "lucide-react";
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
import { ScreenshotEditor } from "@/components/screenshot-editor";

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
  const [screenshotRaw, setScreenshotRaw] = useState<string | null>(null);
  const [screenshotEdited, setScreenshotEdited] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const reset = () => {
    setType("bug");
    setMessage("");
    setResult(null);
    setSubmitting(false);
    setScreenshotRaw(null);
    setScreenshotEdited(null);
    setShowEditor(false);
    setCapturing(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleCaptureScreenshot = useCallback(async () => {
    // Hide the dialog before capturing
    setCapturing(true);
    onOpenChange(false);

    // Wait for dialog to close and DOM to settle
    await new Promise((r) => setTimeout(r, 350));

    try {
      const { captureScreenshot, canvasToDataUrl } = await import(
        "@/lib/screenshot"
      );
      const canvas = await captureScreenshot();
      const dataUrl = canvasToDataUrl(canvas);
      setScreenshotRaw(dataUrl);
      setScreenshotEdited(null);
      setShowEditor(true);
    } catch (err) {
      console.error("Screenshot capture failed:", err);
      // Re-open dialog with error
      onOpenChange(true);
      setResult({
        success: false,
        message: "Failed to capture screenshot. Please try again.",
      });
    } finally {
      setCapturing(false);
    }
  }, [onOpenChange]);

  const handleEditorSave = useCallback(
    (editedDataUrl: string) => {
      setScreenshotEdited(editedDataUrl);
      setShowEditor(false);
      // Re-open the feedback dialog
      onOpenChange(true);
    },
    [onOpenChange]
  );

  const handleEditorCancel = useCallback(() => {
    setShowEditor(false);
    setScreenshotRaw(null);
    // Re-open dialog without screenshot
    onOpenChange(true);
  }, [onOpenChange]);

  const handleRemoveScreenshot = () => {
    setScreenshotRaw(null);
    setScreenshotEdited(null);
  };

  const handleEditScreenshot = () => {
    if (screenshotRaw) {
      setShowEditor(true);
      onOpenChange(false);
    }
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
          screenshot: screenshotEdited || undefined,
          context: {
            url: window.location.href,
            userAgent: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult({
          success: true,
          message: "Feedback submitted! Thank you.",
          issueUrl: data.issueUrl,
        });
        setMessage("");
        setScreenshotRaw(null);
        setScreenshotEdited(null);
      } else {
        const data = await res.json().catch(() => ({}));
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

  // Show the full-screen editor overlay
  if (showEditor && screenshotRaw) {
    return (
      <ScreenshotEditor
        imageDataUrl={screenshotEdited || screenshotRaw}
        onSave={handleEditorSave}
        onCancel={handleEditorCancel}
      />
    );
  }

  // Don't render dialog while capturing
  if (capturing) return null;

  const screenshotAttached = !!screenshotEdited;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
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
                  onValueChange={(v) => setType(v as FeedbackType)}
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
                  rows={4}
                  autoFocus
                />
              </div>

              {/* Screenshot section */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">
                  Screenshot
                </label>
                {screenshotAttached ? (
                  <div className="relative rounded border border-border/15 overflow-hidden bg-surface-overlay">
                    <img
                      src={screenshotEdited!}
                      alt="Annotated screenshot"
                      className="w-full max-h-40 object-contain"
                    />
                    <div className="absolute top-1 right-1 flex gap-1">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-surface/80 backdrop-blur-sm"
                        onClick={handleEditScreenshot}
                        title="Edit screenshot"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-surface/80 backdrop-blur-sm"
                        onClick={handleRemoveScreenshot}
                        title="Remove screenshot"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCaptureScreenshot}
                    className="w-full"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Capture Screenshot
                  </Button>
                )}
                {!screenshotAttached && (
                  <p className="text-xs text-text-secondary mt-1">
                    Sensitive content can be redacted before submitting.
                  </p>
                )}
              </div>

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
