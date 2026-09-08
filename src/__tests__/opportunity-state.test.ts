import { describe, it, expect } from "vitest";
import {
    deriveOpportunityState,
    deriveSubmissionState,
    daysUntilClose,
    closeCountdown,
    type Opportunity,
    type OpportunityCandidate,
} from "@/lib/opportunity-state";
import type { CandidateStateValue } from "@/schemas/opportunities";
import type { SubmissionStatusValue } from "@/schemas/submissions";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const OPEN = "2026-07-01T12:00:00.000Z";
const PASSED = "2026-05-01T12:00:00.000Z";

function candidate(
    title: string,
    state: CandidateStateValue,
    submissionStatus?: SubmissionStatusValue
): OpportunityCandidate {
    return {
        id: `cand-${title}`,
        opportunityId: "opp-1",
        projectId: `proj-${title}`,
        state,
        notes: null,
        submissionId: submissionStatus ? `sub-${title}` : null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        project: { id: `proj-${title}`, title },
        submission: submissionStatus ? { id: `sub-${title}`, status: submissionStatus } : null,
    };
}

function opportunity(closeDate: string, candidates: OpportunityCandidate[]): Opportunity {
    return {
        id: "opp-1",
        providerId: "prov-1",
        title: "Spring Prize",
        closeDate,
        reviewDate: null,
        rulesUrl: null,
        entryFee: null,
        wordLimit: null,
        lineLimit: null,
        genreRestrictions: null,
        eligibilityNotes: null,
        status: "found",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        provider: { id: "prov-1", name: "Contest Org" },
        candidates,
    };
}

function names(o: Opportunity) {
    return deriveOpportunityState(o, NOW).candidates.map((c) => c.project.title);
}

describe("deriveOpportunityState", () => {
    it("reports an open contest with nothing attached as awaiting a decision", () => {
        expect(deriveOpportunityState(opportunity(OPEN, []), NOW)).toMatchObject({
            kind: "none",
            label: "No candidates yet",
            candidates: [],
        });
    });

    it("names every shortlisted story rather than counting them", () => {
        const o = opportunity(OPEN, [candidate("Amber", "candidate"), candidate("Mars", "candidate")]);

        expect(deriveOpportunityState(o, NOW).kind).toBe("considering");
        expect(names(o)).toEqual(["Amber", "Mars"]);
    });

    it("names every chosen candidate when more than one is chosen", () => {
        const o = opportunity(OPEN, [
            candidate("Amber", "chosen"),
            candidate("Mars", "chosen"),
            candidate("Dialogue", "candidate"),
        ]);

        expect(deriveOpportunityState(o, NOW).kind).toBe("chosen");
        expect(names(o)).toEqual(["Amber", "Mars"]);
    });

    it("keeps dropped candidates out of the state it displays", () => {
        const o = opportunity(OPEN, [candidate("Amber", "dropped"), candidate("Mars", "candidate")]);

        expect(deriveOpportunityState(o, NOW).kind).toBe("considering");
        expect(names(o)).toEqual(["Mars"]);
    });

    it("treats a contest whose candidates were all dropped as having none", () => {
        const o = opportunity(OPEN, [candidate("Amber", "dropped")]);

        expect(deriveOpportunityState(o, NOW)).toMatchObject({ kind: "none", candidates: [] });
    });

    it("distinguishes a passed deadline with nothing submitted", () => {
        const o = opportunity(PASSED, [candidate("Amber", "chosen")]);

        expect(deriveOpportunityState(o, NOW)).toMatchObject({
            kind: "missed",
            label: "Closed, nothing entered",
            candidates: [],
        });
    });

    it("shows what was entered rather than a missed deadline once a candidate was promoted", () => {
        const o = opportunity(PASSED, [candidate("Amber", "chosen", "submitted")]);

        expect(deriveOpportunityState(o, NOW).kind).toBe("submitted");
        expect(names(o)).toEqual(["Amber"]);
    });

    it("surfaces the submission outcome once the provider has responded", () => {
        const accepted = opportunity(PASSED, [
            candidate("Amber", "chosen", "accepted"),
            candidate("Mars", "chosen", "rejected"),
        ]);
        expect(deriveOpportunityState(accepted, NOW).kind).toBe("accepted");
        expect(names(accepted)).toEqual(["Amber"]);

        const rejected = opportunity(PASSED, [candidate("Mars", "chosen", "rejected")]);
        expect(deriveOpportunityState(rejected, NOW).kind).toBe("rejected");
        expect(names(rejected)).toEqual(["Mars"]);
    });

    it("does not read a withdrawn entry as one still waiting on the provider", () => {
        const o = opportunity(PASSED, [candidate("Amber", "chosen", "withdrawn")]);

        expect(deriveOpportunityState(o, NOW)).toMatchObject({ kind: "withdrawn", label: "Withdrawn" });
        expect(names(o)).toEqual(["Amber"]);
    });

    it("lets a live entry outrank a withdrawn one", () => {
        const o = opportunity(PASSED, [
            candidate("Amber", "chosen", "withdrawn"),
            candidate("Mars", "chosen", "submitted"),
        ]);

        expect(deriveOpportunityState(o, NOW).kind).toBe("submitted");
        expect(names(o)).toEqual(["Mars"]);
    });

    it("still reads as open on the closing day itself", () => {
        const closesToday = opportunity("2026-06-01T12:00:00.000Z", []);

        expect(deriveOpportunityState(closesToday, NOW).kind).toBe("none");
    });
});

describe("daysUntilClose", () => {
    it("counts calendar days forward and backward", () => {
        expect(daysUntilClose("2026-06-01T12:00:00.000Z", NOW)).toBe(0);
        expect(daysUntilClose(OPEN, NOW)).toBe(30);
        expect(daysUntilClose(PASSED, NOW)).toBe(-31);
    });
});

describe("closeCountdown", () => {
    it("reads naturally on either side of the deadline", () => {
        expect(closeCountdown(0)).toBe("closes today");
        expect(closeCountdown(1)).toBe("closes in 1 day");
        expect(closeCountdown(14)).toBe("closes in 14 days");
        expect(closeCountdown(-1)).toBe("closed 1 day ago");
        expect(closeCountdown(-31)).toBe("closed 31 days ago");
    });
});

describe("deriveSubmissionState", () => {
    it("reports the submission's own outcome, with no candidates to name", () => {
        expect(deriveSubmissionState("submitted")).toEqual({ kind: "submitted", label: "Submitted", candidates: [] });
        expect(deriveSubmissionState("accepted")).toEqual({ kind: "accepted", label: "Accepted", candidates: [] });
        expect(deriveSubmissionState("rejected")).toEqual({ kind: "rejected", label: "Rejected", candidates: [] });
        expect(deriveSubmissionState("withdrawn")).toEqual({ kind: "withdrawn", label: "Withdrawn", candidates: [] });
    });
});
