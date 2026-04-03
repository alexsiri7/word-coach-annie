"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface HashnodePublishDialogProps {
  projectId: string;
  projectTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If set, publish a single node (chapter/article) instead of the full project */
  nodeId?: string;
}

export function HashnodePublishDialog({
  projectId,
  projectTitle,
  open,
  onOpenChange,
  nodeId,
}: HashnodePublishDialogProps) {
  const [title, setTitle] = useState(projectTitle);
  const [publishStatus, setPublishStatus] = useState<"draft" | "public" | "unlisted">("draft");
  const [tagsInput, setTagsInput] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ url: string; isDraft: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(projectTitle);
    setPublishStatus("draft");
    setTagsInput("");
    setCanonicalUrl("");
    setError("");
    setResult(null);
  }, [open, projectTitle]);

  const parsedTags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const tagValidationError = parsedTags.some((t) => t.length > 50)
    ? "Each tag must be 50 characters or fewer"
    : "";

  const handlePublish = async () => {
    setPublishing(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/publish-to-hashnode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          publishStatus,
          tags: parsedTags,
          ...(canonicalUrl.trim() ? { canonicalUrl: canonicalUrl.trim() } : {}),
          ...(nodeId ? { nodeId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Publish failed");
        return;
      }
      setResult({
        url: data.hashnodePostUrl,
        isDraft: (data.publishStatus ?? publishStatus) === "draft",
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publish to Hashnode</DialogTitle>
          <DialogDescription>
            Send your story to Hashnode. Draft mode lets you review before going live.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-text-secondary">
              {result.isDraft
                ? "Draft created! Review and publish it from your Hashnode dashboard."
                : "Published successfully!"}
            </p>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              {result.isDraft ? "Open draft in Hashnode" : "Open post in Hashnode"}
            </a>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Post title"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">Publish mode</label>
              <Select
                value={publishStatus}
                onValueChange={(v) => setPublishStatus(v as typeof publishStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft (review before publishing)</SelectItem>
                  <SelectItem value="public">Public (visible in feed)</SelectItem>
                  <SelectItem value="unlisted">Unlisted (shareable link, not in feed)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">
                Tags <span className="text-text-muted font-normal">(optional, comma-separated)</span>
              </label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="fiction, short story, fantasy"
              />
              {tagValidationError ? (
                <p className="text-xs text-danger">{tagValidationError}</p>
              ) : parsedTags.length > 0 ? (
                <p className="text-xs text-text-muted">
                  {parsedTags.map((t) => `"${t}"`).join(", ")}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-secondary">
                Canonical URL <span className="text-text-muted font-normal">(optional)</span>
              </label>
              <Input
                value={canonicalUrl}
                onChange={(e) => setCanonicalUrl(e.target.value)}
                placeholder="https://yourblog.com/original-post"
                type="url"
              />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={publishing}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePublish}
                disabled={publishing || !title.trim() || !!tagValidationError}
                className="flex-1 gap-1.5"
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {publishing ? "Publishing..." : "Publish"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
