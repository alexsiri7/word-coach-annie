"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, SendHorizontal, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

interface ContestSubmission {
  id: string;
  projectId: string;
  providerId: string;
  contestName: string;
  submissionDate: string;
  reviewDate: string | null;
  submissionUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  provider: { id: string; name: string };
}

interface PublicationSubmission {
  id: string;
  projectId: string;
  venueName: string;
  submissionDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Provider {
  id: string;
  name: string;
}

type DialogMode = "create" | "edit";

interface PubForm {
  venueName: string;
  submissionDate: string;
  status: string;
}

interface ContestForm {
  providerId: string;
  contestName: string;
  submissionDate: string;
  reviewDate: string;
  submissionUrl: string;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  withdrawn: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

export default function SubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [contestSubmissions, setContestSubmissions] = useState<ContestSubmission[]>([]);
  const [publicationSubmissions, setPublicationSubmissions] = useState<PublicationSubmission[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Providers
  const [providers, setProviders] = useState<Provider[]>([]);

  // Publication dialog
  const [pubDialogOpen, setPubDialogOpen] = useState(false);
  const [pubDialogMode, setPubDialogMode] = useState<DialogMode>("create");
  const [editingPubId, setEditingPubId] = useState<string | null>(null);
  const [pubForm, setPubForm] = useState<PubForm>({ venueName: "", submissionDate: "", status: "submitted" });
  const [pubSaving, setPubSaving] = useState(false);
  const [pubError, setPubError] = useState<string | null>(null);

  // Contest dialog
  const [contestDialogOpen, setContestDialogOpen] = useState(false);
  const [contestDialogMode, setContestDialogMode] = useState<DialogMode>("create");
  const [editingContestId, setEditingContestId] = useState<string | null>(null);
  const [contestForm, setContestForm] = useState<ContestForm>({
    providerId: "", contestName: "", submissionDate: "", reviewDate: "", submissionUrl: "", status: "submitted",
  });
  const [contestSaving, setContestSaving] = useState(false);
  const [contestError, setContestError] = useState<string | null>(null);

  // Inline provider create (inside contest dialog)
  const [showNewProvider, setShowNewProvider] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [creatingProvider, setCreatingProvider] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "publication"; id: string }
    | { type: "contest"; id: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [contestsRes, pubsRes, projectRes, providersRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/submissions/contests`),
          fetch(`/api/projects/${projectId}/submissions/publications`),
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/providers`),
        ]);
        if (!contestsRes.ok || !pubsRes.ok) throw new Error("Failed to load submissions");
        if (!projectRes.ok) throw new Error("Failed to load project");
        const [contestsData, pubsData, proj] = await Promise.all([
          contestsRes.json(),
          pubsRes.json(),
          projectRes.json(),
        ]);
        setContestSubmissions(contestsData.submissions ?? []);
        setPublicationSubmissions(pubsData.submissions ?? []);
        setProjectTitle(proj.title ?? "");
        if (providersRes.ok) {
          const providersData = await providersRes.json();
          setProviders(providersData.providers ?? []);
        } else {
          console.error("[submissions/page] loadData: providers fetch failed", providersRes.status);
          // providers stays [] — contest form will only offer "Create new provider"
        }
      } catch (err) {
        console.error("[submissions/page] loadData failed", err);
        setError("Failed to load submissions. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId]);

  const totalCount = contestSubmissions.length + publicationSubmissions.length;

  // ── Utility ───────────────────────────────────────────────

  // Returns today's date as YYYY-MM-DD in UTC (consistent with API ISO serialisation).
  function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Publication handlers ──────────────────────────────────

  function openAddPub() {
    setPubDialogMode("create");
    setEditingPubId(null);
    setPubForm({ venueName: "", submissionDate: todayStr(), status: "submitted" });
    setPubError(null);
    setPubDialogOpen(true);
  }

  function openEditPub(s: PublicationSubmission) {
    setPubDialogMode("edit");
    setEditingPubId(s.id);
    setPubForm({
      venueName: s.venueName,
      submissionDate: s.submissionDate.slice(0, 10),
      status: s.status,
    });
    setPubError(null);
    setPubDialogOpen(true);
  }

  async function handleSavePub() {
    if (!pubForm.venueName.trim() || !pubForm.submissionDate) {
      setPubError("Venue name and submission date are required.");
      return;
    }
    setPubSaving(true);
    setPubError(null);
    try {
      const body = {
        venueName: pubForm.venueName.trim(),
        submissionDate: new Date(pubForm.submissionDate).toISOString(),
        status: pubForm.status,
      };
      const url =
        pubDialogMode === "create"
          ? `/api/projects/${projectId}/submissions/publications`
          : `/api/projects/${projectId}/submissions/publications/${editingPubId}`;
      const method = pubDialogMode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const saved = await res.json();
      if (pubDialogMode === "create") {
        setPublicationSubmissions((prev) => [...prev, saved]);
      } else {
        setPublicationSubmissions((prev) =>
          prev.map((s) => (s.id === editingPubId ? saved : s))
        );
      }
      setPubDialogOpen(false);
    } catch (err) {
      console.error("[submissions/page] handleSavePub failed", err);
      setPubError("Failed to save. Please try again.");
    } finally {
      setPubSaving(false);
    }
  }

  // ── Contest handlers ──────────────────────────────────────

  function openAddContest() {
    setContestDialogMode("create");
    setEditingContestId(null);
    setContestForm({ providerId: "", contestName: "", submissionDate: todayStr(), reviewDate: "", submissionUrl: "", status: "submitted" });
    setContestError(null);
    setShowNewProvider(false);
    setNewProviderName("");
    setContestDialogOpen(true);
  }

  function openEditContest(s: ContestSubmission) {
    setContestDialogMode("edit");
    setEditingContestId(s.id);
    setContestForm({
      providerId: s.providerId,
      contestName: s.contestName,
      submissionDate: s.submissionDate.slice(0, 10),
      reviewDate: s.reviewDate ? s.reviewDate.slice(0, 10) : "",
      submissionUrl: s.submissionUrl,
      status: s.status,
    });
    setContestError(null);
    setShowNewProvider(false);
    setNewProviderName("");
    setContestDialogOpen(true);
  }

  async function handleCreateProvider() {
    if (!newProviderName.trim()) return;
    setCreatingProvider(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProviderName.trim() }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const created = await res.json();
      setProviders((prev) => [...prev, created]);
      setContestForm((prev) => ({ ...prev, providerId: created.id }));
      setShowNewProvider(false);
      setNewProviderName("");
    } catch (err) {
      console.error("[submissions/page] handleCreateProvider failed", err);
      setContestError("Failed to create provider. Please try again.");
    } finally {
      setCreatingProvider(false);
    }
  }

  async function handleSaveContest() {
    if (!contestForm.contestName.trim() || !contestForm.providerId || !contestForm.submissionDate) {
      setContestError("Provider, contest name, and submission date are required.");
      return;
    }
    setContestSaving(true);
    setContestError(null);
    try {
      const body: Record<string, unknown> = {
        providerId: contestForm.providerId,
        contestName: contestForm.contestName.trim(),
        submissionDate: new Date(contestForm.submissionDate).toISOString(),
        status: contestForm.status,
      };
      if (contestForm.reviewDate) body.reviewDate = new Date(contestForm.reviewDate).toISOString();
      if (contestForm.submissionUrl.trim()) body.submissionUrl = contestForm.submissionUrl.trim();
      const url =
        contestDialogMode === "create"
          ? `/api/projects/${projectId}/submissions/contests`
          : `/api/projects/${projectId}/submissions/contests/${editingContestId}`;
      const method = contestDialogMode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const saved = await res.json();
      if (contestDialogMode === "create") {
        setContestSubmissions((prev) => [...prev, saved]);
      } else {
        setContestSubmissions((prev) =>
          prev.map((s) => (s.id === editingContestId ? saved : s))
        );
      }
      setContestDialogOpen(false);
    } catch (err) {
      console.error("[submissions/page] handleSaveContest failed", err);
      setContestError("Failed to save. Please try again.");
    } finally {
      setContestSaving(false);
    }
  }

  // ── Delete handler ────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const url =
        deleteTarget.type === "publication"
          ? `/api/projects/${projectId}/submissions/publications/${deleteTarget.id}`
          : `/api/projects/${projectId}/submissions/contests/${deleteTarget.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      if (deleteTarget.type === "publication") {
        setPublicationSubmissions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      } else {
        setContestSubmissions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error("[submissions/page] handleDelete failed", err);
      setDeleteError("Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-surface">
      <div className="h-0.5 accent-gradient flex-shrink-0" />

      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface-raised flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/project/${projectId}`)}
          aria-label="Back to project"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Breadcrumbs
          items={[
            { label: projectTitle || "Project", href: `/project/${projectId}` },
            { label: "Submissions" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 md:px-16 lg:px-24 py-10 md:py-12">
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-16 bg-surface-overlay rounded w-2/3" />
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-surface-overlay rounded" />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <SendHorizontal className="h-12 w-12 opacity-20 mb-4" />
              <p className="text-lg font-editorial italic">No submissions yet</p>
              <p className="text-sm mt-1 opacity-70 mb-6">
                Contest and publication submissions will appear here
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={openAddContest}>
                  <Plus className="h-4 w-4 mr-1" /> Add contest submission
                </Button>
                <Button variant="outline" size="sm" onClick={openAddPub}>
                  <Plus className="h-4 w-4 mr-1" /> Add publication submission
                </Button>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">
              <header className="mb-8 space-y-3">
                <h1 className="display-lg italic font-bold tracking-tight text-text-primary">
                  Submissions
                </h1>
                <p className="label-md text-[11px] tracking-[0.2em] text-text-muted font-semibold">
                  {totalCount} {totalCount === 1 ? "submission" : "submissions"}
                </p>
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={openAddContest}>
                    <Plus className="h-3.5 w-3.5" /> Contest
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={openAddPub}>
                    <Plus className="h-3.5 w-3.5" /> Publication
                  </Button>
                </div>
              </header>

              {contestSubmissions.length > 0 && (
                <section className="mb-10">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-bold tracking-widest text-text-muted uppercase">
                      Contest Submissions
                    </h2>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openAddContest}>
                      <Plus className="h-3.5 w-3.5" /> Add contest
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {contestSubmissions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-4 p-4 bg-surface-raised border border-border rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {s.contestName}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5">
                            {s.provider.name} &middot;{" "}
                            {new Date(s.submissionDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {s.reviewDate && (
                              <>
                                {" "}
                                &middot; Review:{" "}
                                {new Date(s.reviewDate).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </>
                            )}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[s.status] ?? ""}`}
                        >
                          {s.status}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mr-1">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditContest(s)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget({ type: "contest", id: s.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {publicationSubmissions.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-bold tracking-widest text-text-muted uppercase">
                      Publication Submissions
                    </h2>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openAddPub}>
                      <Plus className="h-3.5 w-3.5" /> Add publication
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {publicationSubmissions.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-4 p-4 bg-surface-raised border border-border rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {s.venueName}
                          </p>
                          <p className="text-xs text-text-muted mt-0.5">
                            {new Date(s.submissionDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[s.status] ?? ""}`}
                        >
                          {s.status}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mr-1">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditPub(s)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget({ type: "publication", id: s.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Publication Dialog */}
      <Dialog open={pubDialogOpen} onOpenChange={(o) => { if (!o) setPubDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pubDialogMode === "create" ? "Add Publication Submission" : "Edit Publication Submission"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-text-secondary">Venue name</label>
              <Input
                value={pubForm.venueName}
                onChange={(e) => setPubForm((p) => ({ ...p, venueName: e.target.value }))}
                placeholder="e.g. The New Yorker"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Submission date</label>
              <Input
                type="date"
                value={pubForm.submissionDate}
                onChange={(e) => setPubForm((p) => ({ ...p, submissionDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Status</label>
              <Select value={pubForm.status} onValueChange={(v) => setPubForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {pubError && <p className="text-sm text-destructive">{pubError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPubDialogOpen(false)} disabled={pubSaving}>
              Cancel
            </Button>
            <Button onClick={handleSavePub} disabled={pubSaving}>
              {pubSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contest Dialog */}
      <Dialog open={contestDialogOpen} onOpenChange={(o) => { if (!o) setContestDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {contestDialogMode === "create" ? "Add Contest Submission" : "Edit Contest Submission"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-text-secondary">Provider</label>
              {!showNewProvider ? (
                <Select
                  value={contestForm.providerId}
                  onValueChange={(v) => {
                    if (v === "__new__") {
                      setShowNewProvider(true);
                      setContestForm((p) => ({ ...p, providerId: "" }));
                    } else {
                      setContestForm((p) => ({ ...p, providerId: v }));
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select provider..." /></SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                    {/* Sentinel value — triggers inline-create flow; not a real provider ID */}
                    <SelectItem value="__new__">＋ Create new provider…</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2 items-center mt-1">
                  <Input
                    value={newProviderName}
                    onChange={(e) => setNewProviderName(e.target.value)}
                    placeholder="Provider name"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleCreateProvider} disabled={!newProviderName.trim() || creatingProvider}>
                    {creatingProvider ? "..." : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowNewProvider(false); setNewProviderName(""); }}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Contest name</label>
              <Input
                value={contestForm.contestName}
                onChange={(e) => setContestForm((p) => ({ ...p, contestName: e.target.value }))}
                placeholder="e.g. Hugo Awards"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Submission date</label>
              <Input
                type="date"
                value={contestForm.submissionDate}
                onChange={(e) => setContestForm((p) => ({ ...p, submissionDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Review date (optional)</label>
              <Input
                type="date"
                value={contestForm.reviewDate}
                onChange={(e) => setContestForm((p) => ({ ...p, reviewDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Submission URL (optional)</label>
              <Input
                value={contestForm.submissionUrl}
                onChange={(e) => setContestForm((p) => ({ ...p, submissionUrl: e.target.value }))}
                placeholder="https://..."
                type="url"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-secondary">Status</label>
              <Select value={contestForm.status} onValueChange={(v) => setContestForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {contestError && <p className="text-sm text-destructive">{contestError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContestDialogOpen(false)} disabled={contestSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveContest} disabled={contestSaving}>
              {contestSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteError(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the submission. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive px-1">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
