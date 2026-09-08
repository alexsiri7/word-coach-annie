import { describe, it, expect } from "vitest";
import {
    deriveStoryState,
    deriveStoryStates,
    countNeedsAttention,
    DEADLINE_ATTENTION_DAYS,
    type Story,
    type StoryCandidate,
    type StoryContestSubmission,
    type StoryPublicationSubmission,
} from "@/lib/story-placement";
import type { Opportunity } from "@/lib/opportunity-state";
import type { CandidateStateValue } from "@/schemas/opportunities";
import type { SubmissionStatusValue } from "@/schemas/submissions";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function daysAgo(days: number): string {
    return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function candidate(params: {
    id: string;
    contest: string;
    provider: string;
    state: CandidateStateValue;
    submission?: { status: SubmissionStatusValue; sentDaysAgo: number };
}): StoryCandidate {
    return {
        id: params.id,
        state: params.state,
        opportunity: {
            id: `opp-${params.id}`,
            title: params.contest,
            provider: { id: `prov-${params.provider}`, name: params.provider },
        },
        submission: params.submission
            ? {
                id: `sub-${params.id}`,
                status: params.submission.status,
                submissionDate: daysAgo(params.submission.sentDaysAgo),
            }
            : null,
    };
}

function contestSubmission(params: {
    id: string;
    contest: string;
    provider: string;
    status: SubmissionStatusValue;
    sentDaysAgo: number;
}): StoryContestSubmission {
    return {
        id: params.id,
        contestName: params.contest,
        status: params.status,
        submissionDate: daysAgo(params.sentDaysAgo),
        provider: { id: `prov-${params.provider}`, name: params.provider },
    };
}

function publicationSubmission(params: {
    id: string;
    venue: string;
    status: SubmissionStatusValue;
    sentDaysAgo: number;
}): StoryPublicationSubmission {
    return {
        id: params.id,
        venueName: params.venue,
        status: params.status,
        submissionDate: daysAgo(params.sentDaysAgo),
    };
}

function story(title: string, parts: Partial<Omit<Story, "id" | "title">> = {}): Story {
    return {
        id: `proj-${title}`,
        title,
        candidates: parts.candidates ?? [],
        contestSubmissions: parts.contestSubmissions ?? [],
        publicationSubmissions: parts.publicationSubmissions ?? [],
    };
}

function state(s: Story) {
    return deriveStoryState(s, NOW);
}

function labels(s: Story) {
    return state(s).placements.map((p) => p.label);
}

describe("deriveStoryState", () => {
    it("reads as not out anywhere when nothing is attached", () => {
        expect(state(story("The Amber Throne"))).toMatchObject({ kind: "idle", label: "Not out anywhere", placements: [] });
    });

    it("names the contest a story is shortlisted for", () => {
        const s = story("The Amber Throne", {
            candidates: [candidate({ id: "c1", contest: "Coastal Fiction Prize", provider: "Northern Lights", state: "candidate" })],
        });
        expect(state(s).kind).toBe("shortlisted");
        expect(labels(s)).toEqual(["Shortlisted for Coastal Fiction Prize"]);
    });

    it("distinguishes chosen-but-unsent from shortlisted", () => {
        const s = story("The Amber Throne", {
            candidates: [candidate({ id: "c1", contest: "Coastal Fiction Prize", provider: "Northern Lights", state: "chosen" })],
        });
        expect(state(s)).toMatchObject({ kind: "chosen", label: "Chosen, not yet sent" });
        expect(labels(s)).toEqual(["Chosen for Coastal Fiction Prize"]);
    });

    it("counts the days a submission has been waiting", () => {
        const s = story("The Amber Throne", {
            contestSubmissions: [contestSubmission({ id: "s1", contest: "Harbour Prize", provider: "Harbour Review", status: "submitted", sentDaysAgo: 34 })],
        });
        expect(state(s)).toMatchObject({ kind: "out", label: "Awaiting a response", longestWaitDays: 34 });
        expect(state(s).placements[0]).toMatchObject({ label: "Out with Harbour Prize", daysWaiting: 34 });
    });

    it("says won for a contest and published for a venue", () => {
        const won = story("The Amber Throne", {
            contestSubmissions: [contestSubmission({ id: "s1", contest: "Harbour Prize", provider: "Harbour Review", status: "accepted", sentDaysAgo: 90 })],
        });
        const published = story("Echoes of Mars", {
            publicationSubmissions: [publicationSubmission({ id: "s2", venue: "The Quarterly", status: "accepted", sentDaysAgo: 90 })],
        });
        expect(labels(won)).toEqual(["Won Harbour Prize"]);
        expect(labels(published)).toEqual(["Published in The Quarterly"]);
        expect(state(won).kind).toBe("accepted");
    });

    it("marks a rejected story with nothing sent since as back on the shelf", () => {
        const s = story("Echoes of Mars", {
            publicationSubmissions: [publicationSubmission({ id: "s1", venue: "The Quarterly", status: "rejected", sentDaysAgo: 120 })],
        });
        expect(state(s)).toMatchObject({ kind: "back-on-shelf", label: "Back on the shelf" });
        expect(labels(s)).toEqual(["Rejected by The Quarterly"]);
    });

    it("keeps a rejected story off the shelf once it is shortlisted again", () => {
        const s = story("Echoes of Mars", {
            candidates: [candidate({ id: "c1", contest: "Winter Anthology", provider: "Northern Lights", state: "candidate" })],
            publicationSubmissions: [publicationSubmission({ id: "s1", venue: "The Quarterly", status: "rejected", sentDaysAgo: 120 })],
        });
        expect(state(s).kind).toBe("shortlisted");
    });

    it("shows every place a story sits rather than the most advanced one", () => {
        const s = story("The Amber Throne", {
            candidates: [candidate({ id: "c1", contest: "Winter Anthology", provider: "Northern Lights", state: "chosen" })],
            contestSubmissions: [contestSubmission({ id: "s1", contest: "Harbour Prize", provider: "Harbour Review", status: "submitted", sentDaysAgo: 10 })],
            publicationSubmissions: [publicationSubmission({ id: "s2", venue: "The Quarterly", status: "rejected", sentDaysAgo: 120 })],
        });
        expect(labels(s)).toEqual([
            "Chosen for Winter Anthology",
            "Out with Harbour Prize",
            "Rejected by The Quarterly",
        ]);
    });

    it("counts a promoted candidate and its submission as one placement", () => {
        const promoted = candidate({
            id: "c1",
            contest: "Coastal Fiction Prize",
            provider: "Northern Lights",
            state: "chosen",
            submission: { status: "submitted", sentDaysAgo: 5 },
        });
        const s = story("The Amber Throne", {
            candidates: [promoted],
            contestSubmissions: [
                { ...contestSubmission({ id: "sub-c1", contest: "Coastal Fiction Prize", provider: "Northern Lights", status: "submitted", sentDaysAgo: 5 }) },
            ],
        });
        expect(labels(s)).toEqual(["Out with Coastal Fiction Prize"]);
        expect(state(s).concurrentProviders).toEqual([]);
    });

    it("ignores a dropped candidate but keeps one that was already submitted", () => {
        const s = story("Writing Better Dialogue", {
            candidates: [
                candidate({ id: "c1", contest: "Winter Anthology", provider: "Northern Lights", state: "dropped" }),
                candidate({
                    id: "c2",
                    contest: "Coastal Fiction Prize",
                    provider: "Harbour Review",
                    state: "dropped",
                    submission: { status: "submitted", sentDaysAgo: 7 },
                }),
            ],
        });
        expect(labels(s)).toEqual(["Out with Coastal Fiction Prize"]);
    });

    it("names the providers holding a story at the same time", () => {
        const s = story("The Amber Throne", {
            contestSubmissions: [contestSubmission({ id: "s1", contest: "Harbour Prize", provider: "Harbour Review", status: "submitted", sentDaysAgo: 10 })],
            publicationSubmissions: [publicationSubmission({ id: "s2", venue: "The Quarterly", status: "submitted", sentDaysAgo: 3 })],
        });
        expect(state(s).concurrentProviders).toEqual(["Harbour Review", "The Quarterly"]);
        expect(state(s).longestWaitDays).toBe(10);
    });

    it("does not flag a single provider holding a story twice", () => {
        const s = story("The Amber Throne", {
            contestSubmissions: [
                contestSubmission({ id: "s1", contest: "Harbour Prize", provider: "Harbour Review", status: "submitted", sentDaysAgo: 10 }),
                contestSubmission({ id: "s2", contest: "Harbour Flash Prize", provider: "Harbour Review", status: "submitted", sentDaysAgo: 3 }),
            ],
        });
        expect(state(s).concurrentProviders).toEqual([]);
    });
});

describe("deriveStoryStates", () => {
    it("puts what needs a decision first, longest wait leading the waiting", () => {
        const stories = [
            story("Not out", {}),
            story("Waiting briefly", {
                contestSubmissions: [contestSubmission({ id: "s1", contest: "Harbour Prize", provider: "Harbour Review", status: "submitted", sentDaysAgo: 3 })],
            }),
            story("Waiting a long time", {
                contestSubmissions: [contestSubmission({ id: "s2", contest: "Winter Prize", provider: "Northern Lights", status: "submitted", sentDaysAgo: 90 })],
            }),
            story("Chosen", {
                candidates: [candidate({ id: "c1", contest: "Winter Anthology", provider: "Northern Lights", state: "chosen" })],
            }),
            story("Shelved", {
                publicationSubmissions: [publicationSubmission({ id: "s3", venue: "The Quarterly", status: "rejected", sentDaysAgo: 120 })],
            }),
        ];

        expect(deriveStoryStates(stories, NOW).map((s) => s.story.title)).toEqual([
            "Shelved",
            "Chosen",
            "Waiting a long time",
            "Waiting briefly",
            "Not out",
        ]);
    });
});

function opportunity(params: {
    id: string;
    daysUntilClose: number;
    status?: Opportunity["status"];
    candidateStates?: CandidateStateValue[];
}): Opportunity {
    const closeDate = new Date(NOW.getTime() + params.daysUntilClose * 24 * 60 * 60 * 1000).toISOString();
    return {
        id: params.id,
        providerId: "prov-1",
        title: `Contest ${params.id}`,
        closeDate,
        reviewDate: null,
        rulesUrl: null,
        entryFee: null,
        wordLimit: null,
        lineLimit: null,
        genreRestrictions: null,
        eligibilityNotes: null,
        status: params.status ?? "found",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        provider: { id: "prov-1", name: "Northern Lights" },
        candidates: (params.candidateStates ?? []).map((s, i) => ({
            id: `cand-${params.id}-${i}`,
            opportunityId: params.id,
            projectId: `proj-${i}`,
            state: s,
            notes: null,
            submissionId: null,
            createdAt: NOW.toISOString(),
            updatedAt: NOW.toISOString(),
            project: { id: `proj-${i}`, title: "A story" },
            submission: null,
        })),
    };
}

describe("countNeedsAttention", () => {
    it("counts an approaching deadline with nothing attached", () => {
        expect(countNeedsAttention([], [opportunity({ id: "o1", daysUntilClose: DEADLINE_ATTENTION_DAYS })], NOW)).toBe(1);
    });

    it("leaves out deadlines that are far off, passed, or closed", () => {
        const opportunities = [
            opportunity({ id: "far", daysUntilClose: DEADLINE_ATTENTION_DAYS + 1 }),
            opportunity({ id: "passed", daysUntilClose: -1 }),
            opportunity({ id: "closed", daysUntilClose: 2, status: "closed" }),
        ];
        expect(countNeedsAttention([], opportunities, NOW)).toBe(0);
    });

    it("leaves out an opportunity that already has a story attached", () => {
        const attached = opportunity({ id: "o1", daysUntilClose: 3, candidateStates: ["candidate"] });
        const droppedOnly = opportunity({ id: "o2", daysUntilClose: 3, candidateStates: ["dropped"] });
        expect(countNeedsAttention([], [attached], NOW)).toBe(0);
        expect(countNeedsAttention([], [droppedOnly], NOW)).toBe(1);
    });

    it("counts stories that came back and were never re-sent", () => {
        const stories = [
            story("Shelved", {
                publicationSubmissions: [publicationSubmission({ id: "s1", venue: "The Quarterly", status: "rejected", sentDaysAgo: 120 })],
            }),
            story("Still out", {
                publicationSubmissions: [publicationSubmission({ id: "s2", venue: "The Quarterly", status: "submitted", sentDaysAgo: 5 })],
            }),
            story("Never sent"),
        ];
        expect(countNeedsAttention(stories, [], NOW)).toBe(1);
    });

    it("is zero when nothing is waiting on the author", () => {
        expect(countNeedsAttention([story("Never sent")], [opportunity({ id: "o1", daysUntilClose: 90 })], NOW)).toBe(0);
    });
});
