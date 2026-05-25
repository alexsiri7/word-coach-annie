"use client";

import { useEffect, useState, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckSquare, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  const router = useRouter();
  const [tasks, setTasks] = useState<WritingTask[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});

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
        const [tasksData, proj] = await Promise.all([tasksRes.json(), projectRes.json()]);
        setTasks(tasksData.tasks ?? []);
        setProjectTitle(proj.title ?? "");
      } catch (err) {
        console.error(err);
        setError("Failed to load tasks. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId, filters]);

  async function handleComplete(taskId: string) {
    const res = await fetch(`/api/writing-tasks/${taskId}/complete`, { method: "POST" });
    if (res.ok) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: true } : t)));
    }
  }

  function toggleFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? undefined : value,
    }));
  }

  const taskCount = tasks.length;
  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);

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
      <div className="flex-1 overflow-y-auto">
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

              {/* Filter bar */}
              <div className="mb-8 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mr-1">Energy</span>
                  {ENERGY_OPTIONS.map((e) => (
                    <button
                      key={e}
                      onClick={() => toggleFilter("energy", e)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        filters.energy === e
                          ? ENERGY_COLORS[e]
                          : "bg-surface-overlay text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mr-1">Importance</span>
                  {IMPORTANCE_OPTIONS.map((v) => (
                    <button
                      key={v}
                      onClick={() => toggleFilter("importance", v)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        filters.importance === v
                          ? IMPORTANCE_COLORS[v]
                          : "bg-surface-overlay text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mr-1">Size</span>
                  {SIZE_OPTIONS.map((v) => (
                    <button
                      key={v}
                      onClick={() => toggleFilter("size", v)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        filters.size === v
                          ? SIZE_COLORS[v]
                          : "bg-surface-overlay text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider mr-1">Status</span>
                  <button
                    onClick={() => toggleFilter("completed", false)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      filters.completed === false
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        : "bg-surface-overlay text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    Open
                  </button>
                  <button
                    onClick={() => toggleFilter("completed", true)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                      filters.completed === true
                        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        : "bg-surface-overlay text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    Completed
                  </button>
                </div>
              </div>

              {/* Task list */}
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-text-muted">
                  <ListTodo className="h-12 w-12 opacity-20 mb-4" />
                  <p className="text-lg font-editorial italic">No tasks found</p>
                  <p className="text-sm mt-1 opacity-70">
                    {Object.keys(filters).length > 0
                      ? "Try adjusting your filters"
                      : "Writing tasks created by Annie will appear here"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`bg-surface border border-border rounded-lg p-4 transition-all ${
                        task.completed ? "opacity-60" : "hover:border-accent/40"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {!task.completed ? (
                          <button
                            onClick={() => handleComplete(task.id)}
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
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ENERGY_COLORS[task.energy] ?? ""}`}>
                              {task.energy}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${IMPORTANCE_COLORS[task.importance] ?? ""}`}>
                              {task.importance}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${SIZE_COLORS[task.size] ?? ""}`}>
                              {task.size}
                            </span>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
