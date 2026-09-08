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

/** A contest submission the author recorded without an opportunity behind it. */
export interface UnlinkedContestSubmission {
    id: string;
    projectId: string;
    providerId: string;
    contestName: string;
    submissionDate: string;
    status: SubmissionStatusValue;
    provider: { id: string; name: string };
    project: { id: string; title: string };
}

export type OpportunityStateKind =
    | "accepted"
    | "rejected"
    | "submitted"
    | "withdrawn"
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

type EnteredCandidate = OpportunityCandidate & { submission: NonNullable<OpportunityCandidate["submission"]> };

function isEntered(candidate: OpportunityCandidate): candidate is EnteredCandidate {
    return candidate.submission !== null;
}

/**
 * Every outcome a promoted candidate can reach, so that a new `SubmissionStatus` member
 * cannot quietly inherit another one's label. When an opportunity holds several entries,
 * the lowest precedence wins — a decision already made outranks one still pending, and a
 * withdrawal is what is left to report only when nothing else happened.
 */
const OUTCOMES: Record<SubmissionStatusValue, { kind: OpportunityStateKind; label: string; precedence: number }> = {
    accepted: { kind: "accepted", label: "Accepted", precedence: 0 },
    rejected: { kind: "rejected", label: "Rejected", precedence: 1 },
    submitted: { kind: "submitted", label: "Submitted", precedence: 2 },
    withdrawn: { kind: "withdrawn", label: "Withdrawn", precedence: 3 },
};

/**
 * Collapse the three records that hold an opportunity's state — the opportunity, its
 * candidates and any submission a candidate was promoted into — into the single value a
 * row displays. Precedence runs from the furthest stage backwards, except that a passed
 * deadline with nothing submitted outranks any shortlisting: that a contest was meant to
 * be entered and wasn't is the fact nothing else in the model records.
 */
export function deriveOpportunityState(opportunity: Opportunity, now: Date): OpportunityState {
    const { candidates } = opportunity;
    const entered = candidates.filter(isEntered);

    if (entered.length > 0) {
        const outcome = entered
            .map((c) => c.submission.status)
            .reduce((a, b) => (OUTCOMES[a].precedence <= OUTCOMES[b].precedence ? a : b));
        const { kind, label } = OUTCOMES[outcome];
        return { kind, label, candidates: entered.filter((c) => c.submission.status === outcome) };
    }

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
 * What a submission with no opportunity behind it reports: its own outcome. Nothing is
 * derived, because there is no deadline to have missed and no shortlist to have been on.
 */
export function deriveSubmissionState(status: SubmissionStatusValue): OpportunityState {
    const { kind, label } = OUTCOMES[status];
    return { kind, label, candidates: [] };
}

/**
 * Whole days from `from` to `to`, counted between calendar days rather than instants so
 * that two moments on the same day are zero days apart however many hours separate them.
 */
export function calendarDaysBetween(from: Date | string, to: Date | string): number {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/** Whole days from today to the close date, negative once the deadline has passed. */
export function daysUntilClose(closeDate: string, now: Date): number {
    return calendarDaysBetween(now, closeDate);
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatCloseDate(closeDate: string): string {
    return formatDate(closeDate);
}

/** How the close date reads relative to today. */
export function closeCountdown(days: number): string {
    if (days === 0) return "closes today";
    if (days > 0) return `closes in ${days} ${days === 1 ? "day" : "days"}`;
    const passed = -days;
    return `closed ${passed} ${passed === 1 ? "day" : "days"} ago`;
}
