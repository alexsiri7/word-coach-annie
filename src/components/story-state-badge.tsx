import type { Placement, PlacementKind, StoryState, StoryStateKind } from "@/lib/story-placement";

const STATE_COLORS: Record<StoryStateKind, string> = {
  "back-on-shelf": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  chosen: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  out: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  shortlisted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  idle: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

const PLACEMENT_COLORS: Record<PlacementKind, string> = {
  shortlisted: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  chosen: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  out: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  withdrawn: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

function waitedFor(days: number): string {
  if (days <= 0) return "sent today";
  return `${days} ${days === 1 ? "day" : "days"} waiting`;
}

export function StoryStateBadge({ state }: { state: StoryState }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATE_COLORS[state.kind]}`}>
      {state.label}
    </span>
  );
}

/** One place the story sits, named — several of these render a story in several places. */
export function PlacementBadge({ placement }: { placement: Placement }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${PLACEMENT_COLORS[placement.kind]}`}>
        {placement.label}
      </span>
      {placement.daysWaiting !== null && (
        <span className="text-xs text-text-muted">{waitedFor(placement.daysWaiting)}</span>
      )}
    </span>
  );
}
