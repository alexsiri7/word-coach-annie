import type {
  WritingTaskCapacityValue,
  WritingTaskImportanceValue,
  WritingTaskSizeValue,
} from "@/schemas/writing-tasks";

export interface RankableWritingTask {
  importance: WritingTaskImportanceValue;
  size: WritingTaskSizeValue;
  capacity: WritingTaskCapacityValue;
  /** The task's due date, or else the nearest linked opportunity deadline; resolved by the caller. */
  deadline: Date | null;
}

export const DEFAULT_SUGGESTION_LIMIT = 5;

const CAPACITY_RANK: Record<WritingTaskCapacityValue, number> = { Low: 0, Medium: 1, Full: 2 };
const IMPORTANCE_RANK: Record<WritingTaskImportanceValue, number> = { Critical: 0, High: 1, Medium: 2 };
const SIZE_RANK: Record<WritingTaskSizeValue, number> = { Small: 0, Medium: 1, Large: 2 };

function compareDeadlines(a: Date | null, b: Date | null): number {
  if (a && b) return a.getTime() - b.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
}

export function fitsCapacity(
  taskCapacity: WritingTaskCapacityValue,
  capacity: WritingTaskCapacityValue,
): boolean {
  return CAPACITY_RANK[taskCapacity] <= CAPACITY_RANK[capacity];
}

function compareTasks(a: RankableWritingTask, b: RankableWritingTask): number {
  return (
    IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance] ||
    compareDeadlines(a.deadline, b.deadline) ||
    SIZE_RANK[a.size] - SIZE_RANK[b.size]
  );
}

/** Orders tasks by importance, then soonest deadline, then smallest size. */
export function rankTasks<T extends RankableWritingTask>(tasks: readonly T[]): T[] {
  return [...tasks].sort(compareTasks);
}

/**
 * Picks the tasks to suggest to a writer at the given capacity: only tasks suited to
 * that capacity or less, ranked by importance, then soonest deadline, then smallest size.
 */
export function pickSuggestedTasks<T extends RankableWritingTask>(
  tasks: readonly T[],
  capacity: WritingTaskCapacityValue,
  limit: number = DEFAULT_SUGGESTION_LIMIT,
): T[] {
  return rankTasks(tasks.filter((task) => fitsCapacity(task.capacity, capacity))).slice(0, limit);
}
