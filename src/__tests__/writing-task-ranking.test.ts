import { describe, it, expect } from "vitest";
import {
  DEFAULT_SUGGESTION_LIMIT,
  pickSuggestedTasks,
  type RankableWritingTask,
} from "@/lib/writing-task-ranking";
import type { WritingTaskKindValue } from "@/schemas/writing-tasks";

type Task = RankableWritingTask & { name: string; kind: WritingTaskKindValue };

function task(name: string, overrides: Partial<Task> = {}): Task {
  return {
    name,
    kind: "Draft",
    importance: "Medium",
    size: "Medium",
    capacity: "Full",
    deadline: null,
    ...overrides,
  };
}

const names = (tasks: Task[]) => tasks.map((t) => t.name);

describe("pickSuggestedTasks", () => {
  it("at Low capacity suggests only low-capacity Read/Gather/Admin tasks, not drafting", () => {
    const tasks = [
      task("draft chapter", { kind: "Draft", capacity: "Full", importance: "Critical" }),
      task("revise scene", { kind: "Revise", capacity: "Medium", importance: "Critical" }),
      task("read comps", { kind: "Read", capacity: "Low" }),
      task("gather research", { kind: "Gather", capacity: "Low" }),
      task("submit invoice", { kind: "Admin", capacity: "Low" }),
    ];

    const suggested = pickSuggestedTasks(tasks, "Low");

    expect(names(suggested).sort()).toEqual(["gather research", "read comps", "submit invoice"]);
    expect(suggested.every((t) => ["Read", "Gather", "Admin"].includes(t.kind))).toBe(true);
  });

  it("at Medium capacity includes Low and Medium tasks but excludes Full ones", () => {
    const tasks = [
      task("full", { capacity: "Full" }),
      task("medium", { capacity: "Medium" }),
      task("low", { capacity: "Low" }),
    ];

    expect(names(pickSuggestedTasks(tasks, "Medium")).sort()).toEqual(["low", "medium"]);
  });

  it("at Full capacity includes every task", () => {
    const tasks = [task("full", { capacity: "Full" }), task("low", { capacity: "Low" })];

    expect(pickSuggestedTasks(tasks, "Full")).toHaveLength(2);
  });

  it("ranks by importance first, over deadline and size", () => {
    const tasks = [
      task("medium", { importance: "Medium", size: "Small", deadline: new Date("2026-01-01") }),
      task("critical", { importance: "Critical", size: "Large" }),
      task("high", { importance: "High", size: "Small", deadline: new Date("2026-01-01") }),
    ];

    expect(names(pickSuggestedTasks(tasks, "Full"))).toEqual(["critical", "high", "medium"]);
  });

  it("within equal importance, ranks the soonest deadline first and undated tasks last", () => {
    const tasks = [
      task("undated", { size: "Small" }),
      task("later", { deadline: new Date("2026-12-01"), size: "Large" }),
      task("sooner", { deadline: new Date("2026-10-01"), size: "Large" }),
    ];

    expect(names(pickSuggestedTasks(tasks, "Full"))).toEqual(["sooner", "later", "undated"]);
  });

  it("within equal importance and deadline, ranks smaller tasks first", () => {
    const deadline = new Date("2026-10-01");
    const tasks = [
      task("large", { size: "Large", deadline }),
      task("small", { size: "Small", deadline }),
      task("medium", { size: "Medium", deadline }),
    ];

    expect(names(pickSuggestedTasks(tasks, "Full"))).toEqual(["small", "medium", "large"]);
  });

  it("returns at most the default limit, or the requested limit", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task(`t${i}`));

    expect(pickSuggestedTasks(tasks, "Full")).toHaveLength(DEFAULT_SUGGESTION_LIMIT);
    expect(pickSuggestedTasks(tasks, "Full", 3)).toHaveLength(3);
  });

  it("does not reorder the caller's array", () => {
    const tasks = [task("medium", { importance: "Medium" }), task("critical", { importance: "Critical" })];

    pickSuggestedTasks(tasks, "Full");

    expect(names(tasks)).toEqual(["medium", "critical"]);
  });
});
