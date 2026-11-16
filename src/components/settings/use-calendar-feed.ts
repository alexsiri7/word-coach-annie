import { useState, useEffect, useCallback } from "react";

export function useCalendarFeed() {
  const [feedPath, setFeedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetch("/api/account/calendar-feed")
      .then((res) => {
        if (!res.ok) throw new Error(`calendar feed fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { feedPath: string }) => setFeedPath(data.feedPath))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const feedUrl = feedPath && typeof window !== "undefined" ? `${window.location.origin}${feedPath}` : "";

  const copy = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy calendar feed URL", err);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const res = await fetch("/api/account/calendar-feed", {
        method: "POST",
        headers: { "X-CSRF-Protection": "1" },
      });
      if (!res.ok) throw new Error(`calendar feed regenerate failed: ${res.status}`);
      const data: { feedPath: string } = await res.json();
      setFeedPath(data.feedPath);
      setRegenerateOpen(false);
    } catch (err) {
      console.error("Failed to regenerate calendar feed URL", err);
    } finally {
      setRegenerating(false);
    }
  };

  return { loading, feedUrl, copied, regenerateOpen, setRegenerateOpen, regenerating, reload, copy, regenerate };
}

export type CalendarFeed = ReturnType<typeof useCalendarFeed>;
