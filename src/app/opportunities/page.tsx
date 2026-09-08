"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookText, Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  deriveOpportunityState, daysUntilClose, formatCloseDate, closeCountdown, type Opportunity,
} from "@/lib/opportunity-state";
import { OpportunityStateBadge } from "@/components/opportunity-state-badge";
import { OpportunityStatus } from "@/schemas/opportunities";

interface Provider {
  id: string;
  name: string;
}

interface Project {
  id: string;
  title: string;
}

interface Filters {
  status?: string;
  providerId?: string;
  projectId?: string;
}

const STATUS_OPTIONS = OpportunityStatus.options;

const ANY = "any";

interface CreateForm {
  providerId: string;
  title: string;
  closeDate: string;
  rulesUrl: string;
}

const EMPTY_CREATE_FORM: CreateForm = { providerId: "", title: "", closeDate: "", rulesUrl: "" };

export default function OpportunitiesPage() {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const query = new URLSearchParams();
        if (filters.status) query.set("status", filters.status);
        if (filters.providerId) query.set("providerId", filters.providerId);
        if (filters.projectId) query.set("projectId", filters.projectId);

        const [opportunitiesRes, providersRes, projectsRes] = await Promise.all([
          fetch(`/api/opportunities?${query}`),
          fetch("/api/providers"),
          fetch("/api/projects"),
        ]);
        if (!opportunitiesRes.ok) throw new Error("Failed to load opportunities");

        const opportunitiesData = await opportunitiesRes.json();
        setOpportunities(opportunitiesData.opportunities ?? []);
        if (providersRes.ok) setProviders((await providersRes.json()).providers ?? []);
        if (projectsRes.ok) setProjects((await projectsRes.json()).projects ?? []);
      } catch (err) {
        console.error("[opportunities/page] loadData failed", err);
        setError("Failed to load contests. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [filters]);

  async function handleCreate() {
    setCreateError(null);
    if (!createForm.providerId || !createForm.title.trim() || !createForm.closeDate) {
      setCreateError("Provider, title and close date are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: createForm.providerId,
          title: createForm.title.trim(),
          closeDate: new Date(createForm.closeDate).toISOString(),
          ...(createForm.rulesUrl.trim() ? { rulesUrl: createForm.rulesUrl.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not create the contest");
      const created = await res.json();
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      router.push(`/opportunities/${created.id}`);
    } catch (err) {
      console.error("[opportunities/page] handleCreate failed", err);
      setCreateError(err instanceof Error ? err.message : "Could not create the contest");
    } finally {
      setSaving(false);
    }
  }

  function toggleStatus(status: string) {
    setFilters((prev) => ({ ...prev, status: prev.status === status ? undefined : status }));
  }

  const now = new Date();
  const count = opportunities.length;
  const hasFilters = Object.values(filters).some((v) => v !== undefined);

  return (
    <div className="flex flex-col h-screen bg-surface">
      <div className="h-0.5 accent-gradient flex-shrink-0" />

      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-surface-raised flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/")}
          aria-label="Back to projects"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Breadcrumbs items={[{ label: "Contests" }]} />
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
          ) : (
            <div className="animate-fade-in">
              <header className="mb-8 space-y-3">
                <h1 className="display-lg italic font-bold tracking-tight text-text-primary">Contests</h1>
                <p className="label-md text-[11px] tracking-[0.2em] text-text-muted font-semibold">
                  {count} {count === 1 ? "contest" : "contests"}
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => { setCreateForm(EMPTY_CREATE_FORM); setCreateError(null); setCreateOpen(true); }}
                  >
                    <Plus className="h-3.5 w-3.5" /> New contest
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => router.push("/publishing")}
                  >
                    <BookText className="h-3.5 w-3.5" /> Stories
                  </Button>
                </div>
              </header>

              <div className="mb-8 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mr-1">Status</span>
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      onClick={() => toggleStatus(status)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                        filters.status === status
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                          : "bg-surface-overlay text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3 items-center">
                  <Select
                    value={filters.providerId ?? ANY}
                    onValueChange={(v) => setFilters((prev) => ({ ...prev, providerId: v === ANY ? undefined : v }))}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs" aria-label="Filter by provider">
                      <SelectValue placeholder="All providers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>All providers</SelectItem>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.projectId ?? ANY}
                    onValueChange={(v) => setFilters((prev) => ({ ...prev, projectId: v === ANY ? undefined : v }))}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs" aria-label="Filter by story">
                      <SelectValue placeholder="All stories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>All stories</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {opportunities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                  <Trophy className="h-12 w-12 opacity-20 mb-4" />
                  <p className="text-lg font-editorial italic">No contests found</p>
                  <p className="text-sm mt-1 opacity-70">
                    {hasFilters ? "Try adjusting your filters" : "Record a contest to start tracking its deadline"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {opportunities.map((opportunity) => {
                    const state = deriveOpportunityState(opportunity, now);
                    return (
                      <div
                        key={opportunity.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(`/opportunities/${opportunity.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/opportunities/${opportunity.id}`);
                          }
                        }}
                        className={`bg-surface border rounded-lg p-4 transition-all cursor-pointer hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/50 ${
                          state.kind === "missed" ? "border-destructive/50 bg-destructive/5" : "border-border"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{opportunity.title}</p>
                            <p className="text-xs text-text-muted mt-0.5">
                              {opportunity.provider.name} &middot; Closes {formatCloseDate(opportunity.closeDate)} &middot;{" "}
                              {closeCountdown(daysUntilClose(opportunity.closeDate, now))}
                            </p>
                            <div className="mt-2">
                              <OpportunityStateBadge state={state} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New contest</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary" htmlFor="new-contest-title">Title</label>
              <Input
                id="new-contest-title"
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Spring Short Story Prize"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Provider</label>
              <Select
                value={createForm.providerId}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, providerId: v }))}
              >
                <SelectTrigger aria-label="Provider">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary" htmlFor="new-contest-close">Close date</label>
              <Input
                id="new-contest-close"
                type="date"
                value={createForm.closeDate}
                onChange={(e) => setCreateForm((f) => ({ ...f, closeDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary" htmlFor="new-contest-rules">Rules link</label>
              <Input
                id="new-contest-rules"
                value={createForm.rulesUrl}
                onChange={(e) => setCreateForm((f) => ({ ...f, rulesUrl: e.target.value }))}
                placeholder="https://"
              />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
