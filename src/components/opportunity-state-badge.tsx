import type { OpportunityState, OpportunityStateKind } from "@/lib/opportunity-state";
import type { CandidateStateValue } from "@/schemas/opportunities";

const STATE_COLORS: Record<OpportunityStateKind, string> = {
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  withdrawn: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
  missed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  chosen: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  considering: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  none: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

const CANDIDATE_STATE_COLORS: Record<CandidateStateValue, string> = {
  candidate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  chosen: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  dropped: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-300",
};

export function CandidateStateBadge({ state }: { state: CandidateStateValue }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${CANDIDATE_STATE_COLORS[state]}`}
    >
      {state}
    </span>
  );
}

/** The row's single derived state, with the stories it names spelled out beside it. */
export function OpportunityStateBadge({ state }: { state: OpportunityState }) {
  const names = state.candidates.map((c) => c.project.title).join(", ");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATE_COLORS[state.kind]}`}>
        {state.label}
      </span>
      {names && <span className="text-xs text-text-secondary">{names}</span>}
    </div>
  );
}
