"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface Provider {
  id: string;
  name: string;
  website: string;
  notes: string;
}

interface ProviderForm {
  name: string;
  website: string;
  notes: string;
}

const EMPTY_FORM: ProviderForm = { name: "", website: "", notes: "" };

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : fallback;
}

/**
 * Lists the user's providers — shared across all their projects — with create, edit and delete.
 */
export function ProvidersSection({
  providers,
  onSaved,
  onDeleted,
}: {
  providers: Provider[];
  onSaved: (provider: Provider) => void;
  onDeleted: (id: string) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(p: Provider) {
    setEditingId(p.id);
    setForm({ name: p.name, website: p.website, notes: p.notes });
    setSaveError(null);
    setDialogOpen(true);
  }

  function openDelete(p: Provider) {
    setDeleteError(null);
    setDeleteTarget(p);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setSaveError("Provider name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const website = form.website.trim();
      const res = editingId
        ? await fetch(`/api/providers/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: form.name.trim(), website: website || null, notes: form.notes.trim() }),
          })
        : await fetch("/api/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: form.name.trim(), website: website || undefined, notes: form.notes.trim() }),
          });
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to save. Please try again."));
      onSaved(await res.json());
      setDialogOpen(false);
    } catch (err) {
      console.error("[providers-section] handleSave failed", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/providers/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Failed to delete. Please try again."));
      onDeleted(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      console.error("[providers-section] handleDelete failed", err);
      setDeleteError(err instanceof Error ? err.message : "Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold tracking-widest text-text-muted uppercase">Providers</h2>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> Add provider
        </Button>
      </div>
      {providers.length === 0 ? (
        <p className="text-sm text-text-muted">No providers yet.</p>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-4 p-4 bg-surface-raised border border-border rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{p.name}</p>
                {(p.website || p.notes) && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">
                    {[p.website, p.notes].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mr-1" aria-label={`Actions for ${p.name}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => openDelete(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Provider" : "Add Provider"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-text-secondary">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Writers of the Future"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Website (optional)</label>
              <Input
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://..."
                type="url"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Notes (optional)</label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {deleteTarget?.name ?? "the provider"}. A provider that still has
              contest submissions or opportunities cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            {/* A plain button, not AlertDialogAction, so a refused delete keeps the dialog open to show why. */}
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
