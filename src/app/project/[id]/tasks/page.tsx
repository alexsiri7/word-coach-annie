"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckSquare, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import type { WritingTask } from "@/lib/types";

const ENERGY_OPTIONS = ["Introspective", "Dramatic", "Technical"] as const;
const IMPORTANCE_OPTIONS = ["Critical", "High", "Medium"] as const;
const SIZE_OPTIONS = ["Small", "Medium", "Large"] as const;

const ENERGY_COLORS: Record<string, string> = {
  Introspective: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  Dramatic: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  Technical: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

const IMPORTANCE_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  High: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  Medium: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

const SIZE_COLORS: Record<string, string> = {
  Small: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  Medium: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
  Large: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

interface Filters {
  energy?: string;
  importance?: string;
  size?: string;
  completed?: boolean;
}

function TaskBadges({ task }: { task: WritingTask }) {
  return (
    <>
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ENERGY_COLORS[task.energy] ?? ""}`}>{task.energy}</span>
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${IMPORTANCE_COLORS[task.importance] ?? ""}`}>{task.importance}</span>
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${SIZE_COLORS[task.size] ?? ""}`}>{task.size}</span>
    </>
  );
}

function FilterRow({
  label,
  options,
  activeValue,
  colors,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  activeValue: string | undefined;
  colors: Record<string, string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mr-1">{label}</span>
      {options.map((v) => (
        <button
          key={v}
          onClick={() => onToggle(v)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            activeValue === v
              ? colors[v]
              : "bg-surface-overlay text-text-secondary hover:bg-surface-sunken"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export default function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [tasks, setTasks] = useState<WritingTask[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<WritingTask | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const queryParams = new URLSearchParams({ projectId });
        if (filters.energy) queryParams.set("energy", filters.energy);
        if (filters.importance) queryParams.set("importance", filters.importance);
        if (filters.size) queryParams.set("size", filters.size);
        if (filters.completed !== undefined) queryParams.set("completed", String(filters.completed));

        const [tasksRes, projectRes] = await Promise.all([
          fetch(`/api/writing-tasks?${queryParams}`),
          fetch(`/api/projects/${projectId}`),
        ]);
        if (!tasksRes.ok) throw new Error("Failed to load tasks");
        if (!projectRes.ok) throw new Error("Failed to load project");
        const [tasksData, proj] = await Promise.all([tasksRes.json(), projectRes.json()]);
        setTasks(tasksData.tasks ?? []);
        setProjectTitle(proj.title ?? "");
      } catch (err) {
        console.error("[tasks/page] loadData failed", err);
        setError("Failed to load tasks. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId, filters]);

  async function handleComplete(taskId: string): Promise<boolean> {
    setActionError(null);
    try {
      const res = await fetch(`/api/writing-tasks/${taskId}/complete`, { method: "POST" });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: true } : t)));
      return true;
    } catch (err) {
      console.error("[tasks/page] handleComplete failed", err);
      setActionError("Could not mark task as complete. Please try again.");
      return false;
    }
  }

  function toggleFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? undefined : value,
    }));
  }

  function handleTaskClick(task: WritingTask) {
    if (task.sceneId) {
      router.push(`/project/${projectId}?scene=${task.sceneId}`);
    } else {
      setSelectedTask(task);
    }
  }

  const taskCount = tasks.length;
  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="flex flex-col h-screen bg-surface">
      <div className="h-0.5 accent-gradient flex-shrink-0" />

      {/* Header */}
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
            { label: "Writing Tasks" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      {/* Content */}
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
                <h1 className="display-lg italic font-bold tracking-tight text-text-primary">
                  Writing Tasks
                </h1>
                <p className="label-md text-[11px] tracking-[0.2em] text-text-muted font-semibold">
                  {taskCount} {taskCount === 1 ? "task" : "tasks"} &middot; {completedCount} completed
                </p>
              </header>

              {actionError && (
                <p className="text-sm text-destructive mb-4">{actionError}</p>
              )}

              {/* Filter bar */}
              <div className="mb-8 space-y-3">
                <FilterRow label="Energy" options={ENERGY_OPTIONS} activeValue={filters.energy} colors={ENERGY_COLORS} onToggle={(v) => toggleFilter("energy", v)} />
                <FilterRow label="Importance" options={IMPORTANCE_OPTIONS} activeValue={filters.importance} colors={IMPORTANCE_COLORS} onToggle={(v) => toggleFilter("importance", v)} />
                <FilterRow label="Size" options={SIZE_OPTIONS} activeValue={filters.size} colors={SIZE_COLORS} onToggle={(v) => toggleFilter("size", v)} />
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mr-1">Status</span>
                  {([
                    { label: "Open", value: false, activeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
                    { label: "Completed", value: true, activeClass: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
                  ] as const).map(({ label, value, activeClass }) => (
                    <button
                      key={label}
                      onClick={() => toggleFilter("completed", value)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        filters.completed === value ? activeClass : "bg-surface-overlay text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Task list */}
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                  <ListTodo className="h-12 w-12 opacity-20 mb-4" />
                  <p className="text-lg font-editorial italic">No tasks found</p>
                  <p className="text-sm mt-1 opacity-70">
                    {Object.values(filters).some(v => v !== undefined)
                      ? "Try adjusting your filters"
                      : "Writing tasks created by Annie will appear here"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleTaskClick(task)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleTaskClick(task);
                        }
                      }}
                      className={`bg-surface border border-border rounded-lg p-4 transition-all cursor-pointer ${
                        task.completed ? "opacity-60" : "hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {!task.completed ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleComplete(task.id); }}
                            className="mt-0.5 shrink-0 h-5 w-5 rounded border-2 border-border hover:border-accent transition-colors"
                            aria-label="Mark as complete"
                          />
                        ) : (
                          <CheckSquare className="mt-0.5 shrink-0 h-5 w-5 text-green-500" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${task.completed ? "line-through text-text-muted" : "text-text-primary"}`}>
                            {task.name}
                          </div>
                          {task.whatIsNeeded && (
                            <div className="text-xs text-text-secondary mt-1 leading-relaxed">
                              {task.whatIsNeeded}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <TaskBadges task={task} />
                            {task.scene && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-overlay text-text-secondary">
                                {task.scene.title}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Dialog open={selectedTask !== null} onOpenChange={(open) => { if (!open) setSelectedTask(null); }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className={selectedTask?.completed ? "line-through text-text-muted" : "text-text-primary"}>
                      {selectedTask?.name}
                    </DialogTitle>
                    {selectedTask?.whatIsNeeded && (
                      <DialogDescription className="text-text-secondary leading-relaxed">
                        {selectedTask.whatIsNeeded}
                      </DialogDescription>
                    )}
                  </DialogHeader>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {selectedTask && <TaskBadges task={selectedTask} />}
                  </div>
                  {selectedTask && !selectedTask.completed && (
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const ok = await handleComplete(selectedTask.id);
                          if (ok) setSelectedTask(null);
                        }}
                      >
                        Mark as complete
                      </Button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
