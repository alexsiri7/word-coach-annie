"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckSquare, ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import type { TaskDashboardController } from "@/lib/controllers/task-dashboard";
import { groupTasksByProject } from "@/lib/task-dashboard-groups";
import {
  WritingTaskCapacity,
  WritingTaskImportance,
  WritingTaskKind,
  WritingTaskSize,
  type WritingTaskCapacityValue,
  type WritingTaskImportanceValue,
  type WritingTaskKindValue,
  type WritingTaskSizeValue,
} from "@/schemas/writing-tasks";

type TaskDashboard = Awaited<ReturnType<typeof TaskDashboardController.getTaskDashboard>>;
type OpenTask = TaskDashboard["openTasks"][number];
type ProjectOption = { id: string; title: string };

// Radix Select forbids an empty-string item value, so "no project" needs a sentinel.
const PRACTICE = "__practice__";

const CAPACITY_COLORS: Record<WritingTaskCapacityValue, string> = {
  Low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  Full: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const IMPORTANCE_COLORS: Record<WritingTaskImportanceValue, string> = {
  Critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Medium: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

const NEUTRAL_BADGE = "bg-surface-overlay text-text-secondary";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${className}`}>{children}</span>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{children}</h2>
  );
}

function TaskRow({ task, onComplete }: { task: OpenTask; onComplete: (id: string) => void }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-start gap-3">
        <button
          onClick={() => onComplete(task.id)}
          className="mt-0.5 shrink-0 h-5 w-5 rounded border-2 border-border hover:border-accent transition-colors"
          aria-label="Mark as complete"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary">{task.name}</div>
          {task.whatIsNeeded && (
            <div className="text-xs text-text-secondary mt-1 leading-relaxed">{task.whatIsNeeded}</div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge className={NEUTRAL_BADGE}>{task.kind}</Badge>
            <Badge className={CAPACITY_COLORS[task.capacity]}>{task.capacity}</Badge>
            <Badge className={IMPORTANCE_COLORS[task.importance]}>{task.importance}</Badge>
            {task.dueDate && <Badge className={NEUTRAL_BADGE}>Due {formatDay(task.dueDate)}</Badge>}
            <Badge className={NEUTRAL_BADGE}>{task.project?.title ?? "Practice"}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-text-secondary">{label}</label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NewTaskDialog({
  open,
  onOpenChange,
  defaultCapacity,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCapacity: WritingTaskCapacityValue;
  onCreated: () => void;
}) {
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [name, setName] = useState("");
  const [whatIsNeeded, setWhatIsNeeded] = useState("");
  const [projectId, setProjectId] = useState(PRACTICE);
  const [kind, setKind] = useState<WritingTaskKindValue>("Draft");
  const [capacity, setCapacity] = useState<WritingTaskCapacityValue>(defaultCapacity);
  const [importance, setImportance] = useState<WritingTaskImportanceValue>("Medium");
  const [size, setSize] = useState<WritingTaskSizeValue>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setCapacity(defaultCapacity);
  }, [open, defaultCapacity]);

  useEffect(() => {
    if (!open || projects !== null) return;
    fetch("/api/projects?limit=200")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Server responded ${res.status}`))))
      .then((data: { projects: ProjectOption[] }) => setProjects(data.projects))
      .catch((err) => {
        console.error("[tasks/page] loadProjects failed", err);
        setProjects([]);
      });
  }, [open, projects]);

  function reset() {
    setName("");
    setWhatIsNeeded("");
    setProjectId(PRACTICE);
    setKind("Draft");
    setImportance("Medium");
    setSize("Medium");
    setDueDate("");
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/writing-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(whatIsNeeded && { whatIsNeeded }),
          ...(projectId !== PRACTICE && { projectId }),
          kind,
          capacity,
          importance,
          size,
          ...(dueDate && { dueDate }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setFormError(body?.error ?? "Could not create the task. Please try again.");
        return;
      }
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      console.error("[tasks/page] createTask failed", err);
      setFormError("Could not create the task. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="task-name" className="text-sm font-medium text-text-secondary">Name</label>
            <Input id="task-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label htmlFor="task-needed" className="text-sm font-medium text-text-secondary">What is needed</label>
            <Textarea id="task-needed" value={whatIsNeeded} onChange={(e) => setWhatIsNeeded(e.target.value)} rows={2} />
          </div>
          <div>
            <label className="text-sm font-medium text-text-secondary">Project</label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger aria-label="Project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PRACTICE}>No project (Practice)</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <OptionSelect label="Kind" value={kind} options={WritingTaskKind.options} onChange={setKind} />
            <OptionSelect label="Capacity" value={capacity} options={WritingTaskCapacity.options} onChange={setCapacity} />
            <OptionSelect label="Importance" value={importance} options={WritingTaskImportance.options} onChange={setImportance} />
            <OptionSelect label="Size" value={size} options={WritingTaskSize.options} onChange={setSize} />
          </div>
          <div>
            <label htmlFor="task-due" className="text-sm font-medium text-text-secondary">Due date</label>
            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TasksDashboardPage() {
  const router = useRouter();
  const [capacity, setCapacity] = useState<WritingTaskCapacityValue>("Full");
  const [data, setData] = useState<TaskDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setError(null);
        const res = await fetch(`/api/writing-tasks/dashboard?capacity=${capacity}`);
        if (!res.ok) throw new Error("Failed to load tasks");
        setData(await res.json());
      } catch (err) {
        console.error("[tasks/page] loadDashboard failed", err);
        setError("Failed to load your tasks. Please try again.");
      }
    }
    loadDashboard();
  }, [capacity, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function handleComplete(taskId: string) {
    setActionError(null);
    try {
      const res = await fetch(`/api/writing-tasks/${taskId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      reload();
    } catch (err) {
      console.error("[tasks/page] handleComplete failed", err);
      setActionError("Could not mark task as complete. Please try again.");
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
          onClick={() => router.push("/")}
          aria-label="Back to projects"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Breadcrumbs items={[{ label: "Writing tasks" }]} />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 md:px-16 lg:px-24 py-10 md:py-12">
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : data === null ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-16 bg-surface-overlay rounded w-2/3" />
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 bg-surface-overlay rounded" />
                ))}
              </div>
            </div>
          ) : (
            <div className="animate-fade-in space-y-10">
              <header className="space-y-4">
                <h1 className="display-lg italic font-bold tracking-tight text-text-primary">Writing tasks</h1>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    How are you today?
                  </span>
                  <div role="radiogroup" aria-label="How are you today?" className="flex gap-2">
                    {WritingTaskCapacity.options.map((c) => (
                      <button
                        key={c}
                        role="radio"
                        aria-checked={capacity === c}
                        onClick={() => setCapacity(c)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                          capacity === c ? CAPACITY_COLORS[c] : "bg-surface-overlay text-text-secondary hover:bg-surface-sunken"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={() => setDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> New task
                  </Button>
                </div>
                {actionError && <p className="text-sm text-destructive">{actionError}</p>}
              </header>

              {data.upcomingDeadlines.length > 0 && (
                <section>
                  <SectionHeading>Upcoming deadlines</SectionHeading>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {data.upcomingDeadlines.map((d) => {
                      const card = (
                        <>
                          <div className="text-xs font-semibold text-text-primary">{formatDay(d.date)}</div>
                          <div className="text-sm text-text-primary mt-1 line-clamp-2">{d.title}</div>
                          <div className="mt-2">
                            <Badge className={NEUTRAL_BADGE}>
                              {d.type === "opportunity" ? "Contest" : (d.project?.title ?? "Practice")}
                            </Badge>
                          </div>
                        </>
                      );
                      const cardClass = "shrink-0 w-44 bg-surface border border-border rounded-lg p-3";
                      return d.type === "opportunity" ? (
                        <Link
                          key={`${d.type}-${d.id}`}
                          href={`/opportunities/${d.id}`}
                          className={`${cardClass} hover:border-accent/40 transition-colors`}
                        >
                          {card}
                        </Link>
                      ) : (
                        <div key={`${d.type}-${d.id}`} className={cardClass}>
                          {card}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section>
                <SectionHeading>Suggested now</SectionHeading>
                {data.suggestedNow.length === 0 ? (
                  <p className="text-sm text-text-muted">Nothing fits right now — try a different capacity.</p>
                ) : (
                  <div className="space-y-3">
                    {data.suggestedNow.map((task) => (
                      <TaskRow key={task.id} task={task} onComplete={handleComplete} />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <SectionHeading>By project</SectionHeading>
                {data.openTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-text-muted">
                    <ListTodo className="h-12 w-12 opacity-20 mb-4" />
                    <p className="text-lg font-editorial italic">No open tasks</p>
                    <p className="text-sm mt-1 opacity-70">Create one, or ask Annie to capture one while you write</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {groupTasksByProject(data.openTasks).map((group) => (
                      <div key={group.key}>
                        <h3 className="text-sm font-semibold text-text-primary mb-2">
                          {group.project ? (
                            <Link href={`/project/${group.project.id}/tasks`} className="hover:underline">
                              {group.title}
                            </Link>
                          ) : (
                            group.title
                          )}
                        </h3>
                        <div className="space-y-3">
                          {group.tasks.map((task) => (
                            <TaskRow key={task.id} task={task} onComplete={handleComplete} />
                          ))}
                        </div>
                      </div>
                    ))}
                    {data.openTaskTotal > data.openTasks.length && (
                      <p className="text-xs text-text-muted">
                        Showing {data.openTasks.length} of {data.openTaskTotal} open tasks
                      </p>
                    )}
                  </div>
                )}
              </section>

              {data.completedThisWeek.length > 0 && (
                <section>
                  <SectionHeading>Done this week</SectionHeading>
                  <ul className="space-y-2">
                    {data.completedThisWeek.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-sm">
                        <CheckSquare className="h-4 w-4 shrink-0 text-green-500" />
                        <span className="line-through text-text-muted">{t.name}</span>
                        <span className="text-xs text-text-muted">· {t.project?.title ?? "Practice"}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      <NewTaskDialog open={dialogOpen} onOpenChange={setDialogOpen} defaultCapacity={capacity} onCreated={reload} />
    </div>
  );
}
