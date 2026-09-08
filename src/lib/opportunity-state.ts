import type { CandidateStateValue, OpportunityStatusValue } from "@/schemas/opportunities";
import type { SubmissionStatusValue } from "@/schemas/submissions";

export interface OpportunityCandidate {
    id: string;
    opportunityId: string;
    projectId: string;
    state: CandidateStateValue;
    notes: string | null;
    submissionId: string | null;
    createdAt: string;
    updatedAt: string;
    project: { id: string; title: string };
    submission: { id: string; status: SubmissionStatusValue } | null;
}

export interface Opportunity {
    id: string;
    providerId: string;
    title: string;
    closeDate: string;
    reviewDate: string | null;
    rulesUrl: string | null;
    entryFee: string | null;
    wordLimit: number | null;
    lineLimit: number | null;
    genreRestrictions: string | null;
    eligibilityNotes: string | null;
    status: OpportunityStatusValue;
    createdAt: string;
    updatedAt: string;
    provider: { id: string; name: string };
    candidates: OpportunityCandidate[];
}

export type OpportunityStateKind =
    | "accepted"
    | "rejected"
    | "submitted"
    | "missed"
    | "chosen"
    | "considering"
    | "none";

export interface OpportunityState {
    kind: OpportunityStateKind;
    label: string;
    /** The candidates the label is about — named in the UI, never merely counted. */
    candidates: OpportunityCandidate[];
}

/**
 * Collapse the three records that hold an opportunity's state — the opportunity, its
 * candidates and any submission a candidate was promoted into — into the single value a
 * row displays. Precedence runs from the furthest stage backwards, except that a passed
 * deadline with nothing submitted outranks any shortlisting: that a contest was meant to
 * be entered and wasn't is the fact nothing else in the model records.
 */
export function deriveOpportunityState(opportunity: Opportunity, now: Date): OpportunityState {
    const { candidates } = opportunity;
    const entered = candidates.filter((c) => c.submission !== null);

    const accepted = entered.filter((c) => c.submission?.status === "accepted");
    if (accepted.length > 0) return { kind: "accepted", label: "Accepted", candidates: accepted };

    const rejected = entered.filter((c) => c.submission?.status === "rejected");
    if (rejected.length > 0) return { kind: "rejected", label: "Rejected", candidates: rejected };

    if (entered.length > 0) return { kind: "submitted", label: "Submitted", candidates: entered };

    if (daysUntilClose(opportunity.closeDate, now) < 0) {
        return { kind: "missed", label: "Closed, nothing entered", candidates: [] };
    }

    // A dropped candidate has been ruled out, so it never names the row's state — but its
    // note stays readable on the detail view.
    const active = candidates.filter((c) => c.state !== "dropped");

    const chosen = active.filter((c) => c.state === "chosen");
    if (chosen.length > 0) return { kind: "chosen", label: "Chosen", candidates: chosen };

    if (active.length > 0) return { kind: "considering", label: "Considering", candidates: active };

    return { kind: "none", label: "No candidates yet", candidates: [] };
}

/**
 * Whole days from today to the close date, negative once the deadline has passed.
 * Counted in calendar days so that a contest closing later today reads as still open.
 */
export function daysUntilClose(closeDate: string, now: Date): number {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const close = new Date(closeDate);
    close.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return Math.round((close.getTime() - today.getTime()) / MS_PER_DAY);
}

export function formatCloseDate(closeDate: string): string {
    return new Date(closeDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** How the close date reads relative to today. */
export function closeCountdown(days: number): string {
    if (days === 0) return "closes today";
    if (days > 0) return `closes in ${days} ${days === 1 ? "day" : "days"}`;
    const passed = -days;
    return `closed ${passed} ${passed === 1 ? "day" : "days"} ago`;
}
