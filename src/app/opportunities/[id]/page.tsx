"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Plus, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  deriveOpportunityState, daysUntilClose, formatCloseDate, closeCountdown,
  type Opportunity, type OpportunityCandidate,
} from "@/lib/opportunity-state";
import { OpportunityStateBadge } from "@/components/opportunity-state-badge";
import type { CandidateStateValue, OpportunityStatusValue } from "@/schemas/opportunities";

interface Provider {
  id: string;
  name: string;
}

interface Project {
  id: string;
  title: string;
}

interface EditForm {
  providerId: string;
  title: string;
  closeDate: string;
  reviewDate: string;
  rulesUrl: string;
  entryFee: string;
  wordLimit: string;
  lineLimit: string;
  genreRestrictions: string;
  eligibilityNotes: string;
  status: OpportunityStatusValue;
}

const STATUS_OPTIONS: OpportunityStatusValue[] = ["found", "considering", "closed"];
const CANDIDATE_STATES: CandidateStateValue[] = ["candidate", "chosen", "dropped"];

/** `<input type="date">` speaks calendar days; the API speaks ISO instants. */
function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function toIsoOrNull(dateInput: string): string | null {
  return dateInput ? new Date(dateInput).toISOString() : null;
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function formToEdit(opportunity: Opportunity): EditForm {
  return {
    providerId: opportunity.providerId,
    title: opportunity.title,
    closeDate: toDateInput(opportunity.closeDate),
    reviewDate: toDateInput(opportunity.reviewDate),
    rulesUrl: opportunity.rulesUrl ?? "",
    entryFee: opportunity.entryFee ?? "",
    wordLimit: opportunity.wordLimit?.toString() ?? "",
    lineLimit: opportunity.lineLimit?.toString() ?? "",
    genreRestrictions: opportunity.genreRestrictions ?? "",
    eligibilityNotes: opportunity.eligibilityNotes ?? "",
    status: opportunity.status,
  };
}

export default function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: opportunityId } = use(params);
  const router = useRouter();

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const [attachProjectId, setAttachProjectId] = useState("");
  const [notesTarget, setNotesTarget] = useState<OpportunityCandidate | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const loadOpportunity = useCallback(async () => {
    const res = await fetch(`/api/opportunities/${opportunityId}`);
    if (!res.ok) throw new Error("Failed to load contest");
    const data: Opportunity = await res.json();
    setOpportunity(data);
    setForm(formToEdit(data));
  }, [opportunityId]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [, providersRes, projectsRes] = await Promise.all([
          loadOpportunity(),
          fetch("/api/providers"),
          fetch("/api/projects"),
        ]);
        if (providersRes.ok) setProviders((await providersRes.json()).providers ?? []);
        if (projectsRes.ok) setProjects((await projectsRes.json()).projects ?? []);
      } catch (err) {
        console.error("[opportunities/[id]] loadData failed", err);
        setError("Failed to load this contest. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [loadOpportunity]);

  async function patchOpportunity() {
    if (!form) return;
    setActionError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: form.providerId,
          title: form.title.trim(),
          closeDate: toIsoOrNull(form.closeDate) ?? undefined,
          reviewDate: toIsoOrNull(form.reviewDate),
          rulesUrl: form.rulesUrl.trim() || null,
          entryFee: form.entryFee.trim() || null,
          wordLimit: toNumberOrNull(form.wordLimit),
          lineLimit: toNumberOrNull(form.lineLimit),
          genreRestrictions: form.genreRestrictions.trim() || null,
          eligibilityNotes: form.eligibilityNotes.trim() || null,
          status: form.status,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save the contest");
      await loadOpportunity();
    } catch (err) {
      console.error("[opportunities/[id]] patchOpportunity failed", err);
      setActionError(err instanceof Error ? err.message : "Could not save the contest");
    } finally {
      setSaving(false);
    }
  }

  async function candidateAction(request: Promise<Response>, failure: string) {
    setActionError(null);
    try {
      const res = await request;
      if (!res.ok) throw new Error((await res.json()).error ?? failure);
      await loadOpportunity();
    } catch (err) {
      console.error(`[opportunities/[id]] ${failure}`, err);
      setActionError(err instanceof Error ? err.message : failure);
    }
  }

  function attachCandidate() {
    if (!attachProjectId) return;
    const projectId = attachProjectId;
    setAttachProjectId("");
    return candidateAction(
      fetch(`/api/opportunities/${opportunityId}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      }),
      "Could not attach that story"
    );
  }

  function setCandidateState(candidate: OpportunityCandidate, state: CandidateStateValue) {
    return candidateAction(
      fetch(`/api/opportunities/${opportunityId}/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      }),
      "Could not update that candidate"
    );
  }

  async function saveNotes() {
    if (!notesTarget) return;
    const candidate = notesTarget;
    const notes = notesDraft.trim() || null;
    setNotesTarget(null);
    await candidateAction(
      fetch(`/api/opportunities/${opportunityId}/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      }),
      "Could not save those notes"
    );
  }

  function promoteCandidate(candidate: OpportunityCandidate) {
    return candidateAction(
      fetch(`/api/opportunities/${opportunityId}/candidates/${candidate.id}/promote`, { method: "POST" }),
      "Could not promote that candidate"
    );
  }

  const now = new Date();
  const attachable = projects.filter(
    (p) => !opportunity?.candidates.some((c) => c.projectId === p.id)
  );
  const active = opportunity?.candidates.filter((c) => c.state !== "dropped") ?? [];
  const dropped = opportunity?.candidates.filter((c) => c.state === "dropped") ?? [];

  function renderCandidate(candidate: OpportunityCandidate) {
    return (
      <div key={candidate.id} className="p-4 bg-surface-raised border border-border rounded-lg">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[12rem]">
            <p className="text-sm font-medium text-text-primary">{candidate.project.title}</p>
            {candidate.notes && (
              <p className="text-xs text-text-secondary mt-1 leading-relaxed whitespace-pre-wrap">
                {candidate.notes}
              </p>
            )}
            {candidate.submission && (
              <button
                onClick={() => router.push(`/project/${candidate.projectId}/submissions`)}
                className="text-xs text-accent hover:underline mt-2"
              >
                Submission &middot; {candidate.submission.status}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={candidate.state}
              onValueChange={(v) => setCandidateState(candidate, v as CandidateStateValue)}
            >
              <SelectTrigger className="h-8 w-32 text-xs" aria-label={`State for ${candidate.project.title}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANDIDATE_STATES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setNotesTarget(candidate); setNotesDraft(candidate.notes ?? ""); }}
            >
              Notes
            </Button>
            {candidate.state === "chosen" && !candidate.submissionId && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => promoteCandidate(candidate)}
              >
                <SendHorizontal className="h-3.5 w-3.5" /> Promote to submission
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-surface">
      <div className="h-0.5 accent-gradient flex-shrink-0" />

      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface-raised flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/opportunities")}
          aria-label="Back to contests"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Breadcrumbs
          items={[
            { label: "Contests", href: "/opportunities" },
            { label: opportunity?.title ?? "Contest" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 md:px-16 lg:px-24 py-10 md:py-12">
          {loading ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-16 bg-surface-overlay rounded w-2/3" />
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 bg-surface-overlay rounded" />
                ))}
              </div>
            </div>
          ) : error || !opportunity || !form ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <p className="text-sm text-destructive">{error ?? "Contest not found."}</p>
            </div>
          ) : (
            <div className="animate-fade-in">
              <header className="mb-8 space-y-3">
                <h1 className="display-lg italic font-bold tracking-tight text-text-primary">
                  {opportunity.title}
                </h1>
                <p className="label-md text-[11px] tracking-[0.2em] text-text-muted font-semibold">
                  {opportunity.provider.name} &middot; Closes {formatCloseDate(opportunity.closeDate)} &middot;{" "}
                  {closeCountdown(daysUntilClose(opportunity.closeDate, now))}
                </p>
                <OpportunityStateBadge state={deriveOpportunityState(opportunity, now)} />
                {opportunity.rulesUrl && (
                  <a
                    href={opportunity.rulesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Rules
                  </a>
                )}
              </header>

              {actionError && <p className="text-sm text-destructive mb-4">{actionError}</p>}

              <section className="mb-10">
                <h2 className="text-xs font-bold tracking-widest text-text-muted uppercase mb-4">Details</h2>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary" htmlFor="opportunity-title">Title</label>
                    <Input
                      id="opportunity-title"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary">Provider</label>
                      <Select value={form.providerId} onValueChange={(v) => setForm({ ...form, providerId: v })}>
                        <SelectTrigger aria-label="Provider"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {providers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary">Status</label>
                      <Select
                        value={form.status}
                        onValueChange={(v) => setForm({ ...form, status: v as OpportunityStatusValue })}
                      >
                        <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary" htmlFor="opportunity-close">Close date</label>
                      <Input
                        id="opportunity-close"
                        type="date"
                        value={form.closeDate}
                        onChange={(e) => setForm({ ...form, closeDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary" htmlFor="opportunity-review">Review date</label>
                      <Input
                        id="opportunity-review"
                        type="date"
                        value={form.reviewDate}
                        onChange={(e) => setForm({ ...form, reviewDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary" htmlFor="opportunity-fee">Entry fee</label>
                      <Input
                        id="opportunity-fee"
                        value={form.entryFee}
                        onChange={(e) => setForm({ ...form, entryFee: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary" htmlFor="opportunity-rules">Rules link</label>
                      <Input
                        id="opportunity-rules"
                        value={form.rulesUrl}
                        onChange={(e) => setForm({ ...form, rulesUrl: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary" htmlFor="opportunity-words">Word limit</label>
                      <Input
                        id="opportunity-words"
                        type="number"
                        value={form.wordLimit}
                        onChange={(e) => setForm({ ...form, wordLimit: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-secondary" htmlFor="opportunity-lines">Line limit</label>
                      <Input
                        id="opportunity-lines"
                        type="number"
                        value={form.lineLimit}
                        onChange={(e) => setForm({ ...form, lineLimit: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary" htmlFor="opportunity-genres">Genre restrictions</label>
                    <Textarea
                      id="opportunity-genres"
                      rows={2}
                      value={form.genreRestrictions}
                      onChange={(e) => setForm({ ...form, genreRestrictions: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-text-secondary" htmlFor="opportunity-eligibility">Eligibility notes</label>
                    <Textarea
                      id="opportunity-eligibility"
                      rows={3}
                      value={form.eligibilityNotes}
                      onChange={(e) => setForm({ ...form, eligibilityNotes: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={patchOpportunity} disabled={saving}>
                      {saving ? "Saving…" : "Save changes"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setForm(formToEdit(opportunity))} disabled={saving}>
                      Reset
                    </Button>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-bold tracking-widest text-text-muted uppercase">Candidates</h2>
                </div>

                {attachable.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <Select value={attachProjectId} onValueChange={setAttachProjectId}>
                      <SelectTrigger className="h-8 w-64 text-xs" aria-label="Attach a story">
                        <SelectValue placeholder="Attach a story" />
                      </SelectTrigger>
                      <SelectContent>
                        {attachable.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={attachCandidate}>
                      <Plus className="h-3.5 w-3.5" /> Attach
                    </Button>
                  </div>
                )}

                {active.length === 0 ? (
                  <p className="text-sm text-text-muted italic">No stories are up for this contest yet.</p>
                ) : (
                  <div className="space-y-3">{active.map(renderCandidate)}</div>
                )}

                {dropped.length > 0 && (
                  <details className="mt-6">
                    <summary className="cursor-pointer text-xs font-bold tracking-widest text-text-muted uppercase">
                      Dropped ({dropped.length})
                    </summary>
                    <div className="space-y-3 mt-4 opacity-70">{dropped.map(renderCandidate)}</div>
                  </details>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      <Dialog open={notesTarget !== null} onOpenChange={(open) => { if (!open) setNotesTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notes on {notesTarget?.project.title}</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={5}
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Why this piece fits — or why it does not"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotesTarget(null)}>Cancel</Button>
            <Button onClick={saveNotes}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
