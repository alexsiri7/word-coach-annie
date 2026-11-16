import { z } from "zod";
import { HttpUrl } from "@/schemas/http-url";
import { defineTool } from "./types";

export const listOpportunitiesSpec = defineTool({
    name: "list_opportunities",
    description: "List submission opportunities (contests and calls you are tracking) for the current user, soonest deadline first. Optional filters narrow the list; omit them all to see everything coming up.",
    destructive: false,
    parameters: z.object({
        status: z.enum(["found", "considering", "closed"]).optional().describe("Only opportunities with this status"),
        providerId: z.string().optional().describe("Only opportunities from this provider (contest organizer or publication)"),
        projectId: z.string().optional().describe("Only opportunities this project has been put forward for as a candidate"),
    }),
});

export const getOpportunitySpec = defineTool({
    name: "get_opportunity",
    description: "Get one opportunity with every candidate entry attached to it — the projects put forward, their state and notes — in a single call. Only opportunities owned by the current user can be read.",
    destructive: false,
    parameters: z.object({
        opportunityId: z.string().describe("The opportunity ID"),
    }),
});

export const createOpportunitySpec = defineTool({
    name: "create_opportunity",
    description: "Track a new submission opportunity — a contest or call for submissions with a deadline.",
    destructive: false,
    parameters: z.object({
        providerId: z.string().describe("The provider (contest organizer or publication) ID"),
        title: z.string().describe("Opportunity title"),
        closeDate: z.string().describe("ISO 8601 date/time submissions close"),
        reviewDate: z.string().optional().describe("ISO 8601 date/time results are expected"),
        rulesUrl: HttpUrl.optional().describe("URL of the rules or call for submissions"),
        entryFee: z.string().optional().describe("Entry fee as free text, e.g. \"£10\" or \"free for subscribers\""),
        wordLimit: z.number().optional().describe("Maximum word count accepted"),
        lineLimit: z.number().optional().describe("Maximum line count accepted"),
        genreRestrictions: z.string().optional().describe("Genre restrictions, e.g. \"speculative fiction only\""),
        eligibilityNotes: z.string().optional().describe("Eligibility rules — residency, previously-published, multiple-entry rules"),
        status: z.enum(["found", "considering", "closed"]).optional().describe("Opportunity status (default \"found\")"),
    }),
});

export const updateOpportunitySpec = defineTool({
    name: "update_opportunity",
    description: "Update fields on an existing opportunity. Only opportunities owned by the current user can be updated. All fields except opportunityId are optional — only provided fields are changed.",
    destructive: false,
    parameters: z.object({
        opportunityId: z.string().describe("The opportunity ID to update"),
        providerId: z.string().optional().describe("New provider ID"),
        title: z.string().optional().describe("New title"),
        closeDate: z.string().optional().describe("New ISO 8601 close date/time"),
        reviewDate: z.string().nullable().optional().describe("New ISO 8601 review date/time, or null to clear it"),
        rulesUrl: HttpUrl.nullable().optional().describe("New rules URL, or null to clear it"),
        entryFee: z.string().nullable().optional().describe("New entry fee, or null to clear it"),
        wordLimit: z.number().nullable().optional().describe("New word limit, or null to clear it"),
        lineLimit: z.number().nullable().optional().describe("New line limit, or null to clear it"),
        genreRestrictions: z.string().nullable().optional().describe("New genre restrictions, or null to clear it"),
        eligibilityNotes: z.string().nullable().optional().describe("New eligibility notes, or null to clear it"),
        status: z.enum(["found", "considering", "closed"]).optional().describe("New status"),
    }),
});

export const deleteOpportunitySpec = defineTool({
    name: "delete_opportunity",
    description: "Delete an opportunity and every candidate entry attached to it. Only opportunities owned by the current user can be deleted.",
    destructive: true,
    parameters: z.object({
        opportunityId: z.string().describe("The opportunity ID to delete"),
    }),
});

export const listOpportunityCandidatesSpec = defineTool({
    name: "list_opportunity_candidates",
    description: "List the projects put forward as candidate entries for an opportunity, oldest first.",
    destructive: false,
    parameters: z.object({
        opportunityId: z.string().describe("The opportunity ID"),
    }),
});

export const createOpportunityCandidateSpec = defineTool({
    name: "create_opportunity_candidate",
    description: "Put a project forward as a candidate entry for an opportunity. A project can be a candidate for an opportunity only once.",
    destructive: false,
    parameters: z.object({
        opportunityId: z.string().describe("The opportunity ID"),
        projectId: z.string().describe("The project (story) being considered"),
        state: z.enum(["candidate", "chosen", "dropped"]).optional().describe("Candidate state (default \"candidate\")"),
        notes: z.string().optional().describe("Why this piece fits, or why it was dropped"),
    }),
});

export const updateOpportunityCandidateSpec = defineTool({
    name: "update_opportunity_candidate",
    description: "Update the state or notes of a candidate entry. All fields except candidateId are optional — only provided fields are changed.",
    destructive: false,
    parameters: z.object({
        candidateId: z.string().describe("The candidate ID to update"),
        state: z.enum(["candidate", "chosen", "dropped"]).optional().describe("New candidate state"),
        notes: z.string().nullable().optional().describe("New notes, or null to clear them"),
    }),
});

export const deleteOpportunityCandidateSpec = defineTool({
    name: "delete_opportunity_candidate",
    description: "Remove a candidate entry from an opportunity. The opportunity and the project are both kept.",
    destructive: true,
    parameters: z.object({
        candidateId: z.string().describe("The candidate ID to delete"),
    }),
});

export const promoteOpportunityCandidateSpec = defineTool({
    name: "promote_opportunity_candidate",
    description: "Promote a chosen candidate into a real contest submission, carrying over the opportunity's provider, title, review date and rules URL. The candidate record is kept and gains the new submission ID. Fails unless the candidate is in state \"chosen\" and has not been promoted already.",
    destructive: false,
    parameters: z.object({
        candidateId: z.string().describe("The candidate ID to promote"),
    }),
});
