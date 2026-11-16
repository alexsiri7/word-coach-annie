import { useState, useEffect } from "react";
import { clearClientData } from "@/lib/offline/clear-client-data";
import { SENTRY_REPLAY_CONSENT_KEY } from "@/lib/constants";

export function usePrivacySettings() {
  const [replayAllowed, setReplayAllowed] = useState(true);
  const [consentLoading, setConsentLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/consent")
      .then((res) => {
        if (!res.ok) throw new Error(`consent fetch failed: ${res.status}`);
        return res.json();
      })
      .then((rows: Array<{ feature: string; consentGiven: boolean }>) => {
        const replay = rows.find((r) => r.feature === "sentry_replay");
        setReplayAllowed(replay?.consentGiven ?? true);
      })
      .catch((err) => {
        console.error(err);
        setReplayAllowed(false); // fail closed: assume opted-out on error
      })
      .finally(() => setConsentLoading(false));
  }, []);

  const toggleReplay = async (allowed: boolean) => {
    const previous = replayAllowed;
    setReplayAllowed(allowed);
    localStorage.setItem(SENTRY_REPLAY_CONSENT_KEY, String(allowed));
    try {
      const res = await fetch("/api/account/consent", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
        body: JSON.stringify({ feature: "sentry_replay", consentGiven: allowed }),
      });
      if (!res.ok) throw new Error(`consent PUT failed: ${res.status}`);
    } catch (err) {
      console.error("Failed to save consent preference", err);
      setReplayAllowed(previous);
      localStorage.setItem(SENTRY_REPLAY_CONSENT_KEY, String(previous));
    }
  };

  const exportData = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/auth/export-data");
      if (!res.ok) {
        setExportError("Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annie-export-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export failed. Please check your connection and try again.");
    } finally {
      setExporting(false);
    }
  };

  const openDelete = () => setDeleteOpen(true);

  const onDeleteOpenChange = (open: boolean) => {
    setDeleteOpen(open);
    setDeleteConfirmEmail("");
    setDeleteError(null);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
        body: JSON.stringify({ email: deleteConfirmEmail }),
      });
      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || "Deletion failed. Please try again.");
        return;
      }
      await clearClientData();
      window.location.href = "/";
    } catch (err) {
      console.error("Failed to delete account:", err);
      setDeleteError("Deletion failed. Please check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  };

  return {
    consentLoading,
    replayAllowed,
    toggleReplay,
    exporting,
    exportError,
    exportData,
    deleteOpen,
    openDelete,
    onDeleteOpenChange,
    deleteConfirmEmail,
    setDeleteConfirmEmail,
    deleting,
    deleteError,
    deleteAccount,
  };
}

export type PrivacySettings = ReturnType<typeof usePrivacySettings>;
