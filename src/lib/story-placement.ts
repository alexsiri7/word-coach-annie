import { calendarDaysBetween, daysUntilClose, type Opportunity } from "@/lib/opportunity-state";
import type { CandidateStateValue } from "@/schemas/opportunities";
import type { SubmissionStatusValue } from "@/schemas/submissions";

export interface StoryCandidate {
    id: string;
    state: CandidateStateValue;
    opportunity: { id: string; title: string; provider: { id: string; name: string } };
    submission: { id: string; status: SubmissionStatusValue; submissionDate: string } | null;
}

export interface StoryContestSubmission {
    id: string;
    contestName: string;
    status: SubmissionStatusValue;
    submissionDate: string;
    provider: { id: string; name: string };
}

export interface StoryPublicationSubmission {
    id: string;
    venueName: string;
    status: SubmissionStatusValue;
    submissionDate: string;
}

export interface Story {
    id: string;
    title: string;
    candidates: StoryCandidate[];
    contestSubmissions: StoryContestSubmission[];
    publicationSubmissions: StoryPublicationSubmission[];
}

export type PlacementKind = "shortlisted" | "chosen" | "out" | "accepted" | "rejected" | "withdrawn";

/** One place a story currently sits, named rather than counted. */
export interface Placement {
    id: string;
    kind: PlacementKind;
    label: string;
    /** Who is holding it — the name the simultaneous-submission note is counted over. */
    provider: string;
    daysWaiting: number | null;
}

export type StoryStateKind = "back-on-shelf" | "chosen" | "out" | "shortlisted" | "accepted" | "idle";

export interface StoryState {
    story: Story;
    kind: StoryStateKind;
    label: string;
    placements: Placement[];
    /** Longest wait among the placements still awaiting a response, 0 when none are. */
    longestWaitDays: number;
    /** Named only when a story is out with more than one at once — otherwise empty. */
    concurrentProviders: string[];
}

/**
 * A submission's outcome as a story-side placement. `submitted` is the only status that
 * leaves the story waiting, so it is the only one that carries a day count.
 */
const OUTCOMES: Record<SubmissionStatusValue, { kind: PlacementKind; verb: (where: string) => string }> = {
    submitted: { kind: "out", verb: (where) => `Out with ${where}` },
    accepted: { kind: "accepted", verb: (where) => `Accepted by ${where}` },
    rejected: { kind: "rejected", verb: (where) => `Rejected by ${where}` },
    withdrawn: { kind: "withdrawn", verb: (where) => `Withdrawn from ${where}` },
};

function submissionPlacement(params: {
    id: string;
    status: SubmissionStatusValue;
    submissionDate: string;
    where: string;
    provider: string;
    accepted: string;
    now: Date;
}): Placement {
    const { kind, verb } = OUTCOMES[params.status];
    return {
        id: params.id,
        kind,
        label: kind === "accepted" ? params.accepted : verb(params.where),
        provider: params.provider,
        daysWaiting: kind === "out" ? calendarDaysBetween(params.submissionDate, params.now) : null,
    };
}

/**
 * Every place a story sits, across contest candidates, contest submissions and publication
 * submissions. A promoted candidate and the contest submission it created are one placement,
 * not two — counting both would also invent a second provider for the concurrency note.
 * A dropped candidate has been ruled out and names nothing, unless it was already promoted:
 * the story really is out with that contest whatever the candidate row now says.
 */
function placementsOf(story: Story, now: Date): Placement[] {
    const placements: Placement[] = [];
    const promoted = new Set<string>();

    for (const candidate of story.candidates) {
        const { opportunity, submission } = candidate;
        if (submission) {
            promoted.add(submission.id);
            placements.push(
                submissionPlacement({
                    id: candidate.id,
                    status: submission.status,
                    submissionDate: submission.submissionDate,
                    where: opportunity.title,
                    provider: opportunity.provider.name,
                    accepted: `Won ${opportunity.title}`,
                    now,
                })
            );
            continue;
        }
        if (candidate.state === "dropped") continue;
        placements.push({
            id: candidate.id,
            kind: candidate.state === "chosen" ? "chosen" : "shortlisted",
            label: `${candidate.state === "chosen" ? "Chosen for" : "Shortlisted for"} ${opportunity.title}`,
            provider: opportunity.provider.name,
            daysWaiting: null,
        });
    }

    for (const submission of story.contestSubmissions) {
        if (promoted.has(submission.id)) continue;
        placements.push(
            submissionPlacement({
                id: submission.id,
                status: submission.status,
                submissionDate: submission.submissionDate,
                where: submission.contestName,
                provider: submission.provider.name,
                accepted: `Won ${submission.contestName}`,
                now,
            })
        );
    }

    for (const submission of story.publicationSubmissions) {
        placements.push(
            submissionPlacement({
                id: submission.id,
                status: submission.status,
                submissionDate: submission.submissionDate,
                where: submission.venueName,
                provider: submission.venueName,
                accepted: `Published in ${submission.venueName}`,
                now,
            })
        );
    }

    return placements;
}

/**
 * The one state a story row is headlined with, ordered by what most needs the author.
 * "Back on the shelf" needs every other kind of placement to be absent: a rejection is only
 * the story's state while nothing has picked it up since, and that silence is what the row
 * exists to render.
 */
function headline(placements: Placement[]): { kind: StoryStateKind; label: string } {
    const has = (kind: PlacementKind) => placements.some((p) => p.kind === kind);

    if (placements.length === 0) return { kind: "idle", label: "Not out anywhere" };
    if (has("rejected") && !has("out") && !has("chosen") && !has("shortlisted") && !has("accepted")) {
        return { kind: "back-on-shelf", label: "Back on the shelf" };
    }
    if (has("chosen")) return { kind: "chosen", label: "Chosen, not yet sent" };
    if (has("out")) return { kind: "out", label: "Awaiting a response" };
    if (has("shortlisted")) return { kind: "shortlisted", label: "Shortlisted" };
    if (has("accepted")) return { kind: "accepted", label: "Accepted" };
    return { kind: "idle", label: "Not out anywhere" };
}

export function deriveStoryState(story: Story, now: Date): StoryState {
    const placements = placementsOf(story, now);
    const waiting = placements.filter((p) => p.kind === "out");
    const providers = [...new Set(waiting.map((p) => p.provider))];

    return {
        story,
        ...headline(placements),
        placements,
        longestWaitDays: waiting.reduce((longest, p) => Math.max(longest, p.daysWaiting ?? 0), 0),
        concurrentProviders: providers.length > 1 ? providers : [],
    };
}

const ORDER: Record<StoryStateKind, number> = {
    "back-on-shelf": 0,
    chosen: 1,
    out: 2,
    shortlisted: 3,
    accepted: 4,
    idle: 5,
};

/** Sorted by what most needs a decision, longest wait first among the stories still waiting. */
export function deriveStoryStates(stories: Story[], now: Date): StoryState[] {
    return stories
        .map((story) => deriveStoryState(story, now))
        .sort((a, b) => {
            if (ORDER[a.kind] !== ORDER[b.kind]) return ORDER[a.kind] - ORDER[b.kind];
            if (a.longestWaitDays !== b.longestWaitDays) return b.longestWaitDays - a.longestWaitDays;
            return a.story.title.localeCompare(b.story.title);
        });
}

/**
 * How close a deadline has to be before an opportunity with nothing attached is worth
 * raising. Two weeks is the longer of the two reminder offsets requirement 031 uses as its
 * example, so the badge lights up no later than a calendar alert would.
 */
export const DEADLINE_ATTENTION_DAYS = 14;

/**
 * The count the dashboard link carries: only what awaits a decision, never a total.
 * A contest whose deadline is near with no story attached, and a story that came back and
 * was never re-sent — the two ways this data goes quiet without anything else recording it.
 */
export function countNeedsAttention(stories: Story[], opportunities: Opportunity[], now: Date): number {
    const undecided = opportunities.filter((o) => {
        if (o.status === "closed") return false;
        const days = daysUntilClose(o.closeDate, now);
        if (days < 0 || days > DEADLINE_ATTENTION_DAYS) return false;
        return o.candidates.every((c) => c.state === "dropped");
    });

    const shelved = stories.filter((s) => deriveStoryState(s, now).kind === "back-on-shelf");

    return undecided.length + shelved.length;
}
