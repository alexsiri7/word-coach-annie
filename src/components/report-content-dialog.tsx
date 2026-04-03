"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
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

type ReportCategory = "copyright" | "illegal" | "harassment" | "other";

interface ReportContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectTitle: string;
}

export function ReportContentDialog({
  open,
  onOpenChange,
  projectId,
  projectTitle,
}: ReportContentDialogProps) {
  const [category, setCategory] = useState<ReportCategory>("copyright");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const reset = () => {
    setCategory("copyright");
    setDetails("");
    setResult(null);
    setSubmitting(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          details: details.trim() || undefined,
          url: window.location.href,
        }),
      });

      if (res.ok) {
        setResult({
          success: true,
          message: "Report submitted. Thank you for helping keep our community safe.",
        });
        setDetails("");
      } else {
        const data = await res.json().catch(() => ({}));
        setResult({
          success: false,
          message: data.error || "Failed to submit report. Please try again.",
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Report Content
          </DialogTitle>
          <DialogDescription>
            Report &ldquo;{projectTitle}&rdquo; for violating content guidelines.
          </DialogDescription>
        </DialogHeader>

        {result?.success ? (
          <div className="py-4 text-center">
            <p className="text-sm text-text-secondary">{result.message}</p>
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
                  Category
                </label>
                <Select
                  value={category}
                  onValueChange={(v) => setCategory(v as ReportCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copyright">Copyright Infringement</SelectItem>
                    <SelectItem value="illegal">Illegal Content</SelectItem>
                    <SelectItem value="harassment">Harassment</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-text-secondary">
                  Details (optional)
                </label>
                <Textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Provide any additional context about why you're reporting this content..."
                  rows={3}
                />
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
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit Report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
