import { z } from "zod";
import { HttpUrl } from "@/schemas/http-url";
import { defineTool } from "./types";

export const listProvidersSpec = defineTool({
    name: "list_providers",
    description: "List all submission providers (publications and contest-running organizations) for the current user.",
    destructive: false,
    parameters: z.object({}),
});

export const createProviderSpec = defineTool({
    name: "create_provider",
    description: "Create a new submission provider — a publication or contest-running organization you submit stories to.",
    destructive: false,
    parameters: z.object({
        name: z.string().describe("Provider name"),
        website: HttpUrl.optional().describe("Provider website URL"),
        notes: z.string().optional().describe("Additional notes about this provider"),
    }),
});

export const updateProviderSpec = defineTool({
    name: "update_provider",
    description: "Update fields on an existing provider. Only providers owned by the current user can be updated. All fields except providerId are optional — only provided fields are changed.",
    destructive: false,
    parameters: z.object({
        providerId: z.string().describe("The provider ID to update"),
        name: z.string().optional().describe("New provider name"),
        website: HttpUrl.optional().describe("New website URL"),
        notes: z.string().optional().describe("New notes"),
    }),
});

export const deleteProviderSpec = defineTool({
    name: "delete_provider",
    description: "Delete a submission provider. Only providers owned by the current user can be deleted. Providers with existing contest submissions or tracked opportunities cannot be deleted.",
    destructive: true,
    parameters: z.object({
        providerId: z.string().describe("The provider ID to delete"),
    }),
});

export const listContestSubmissionsSpec = defineTool({
    name: "list_contest_submissions",
    description: "List contest submissions for a project (a story's submissions to literary contests), newest first.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const createContestSubmissionSpec = defineTool({
    name: "create_contest_submission",
    description: "Record a new contest submission for a project.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        providerId: z.string().describe("The provider (contest organizer) ID"),
        contestName: z.string().describe("Name of the contest"),
        submissionDate: z.string().describe("ISO 8601 date/time the story was submitted"),
        reviewDate: z.string().optional().describe("ISO 8601 date/time the submission was/will be reviewed"),
        submissionUrl: HttpUrl.optional().describe("URL of the submission or contest listing"),
        status: z.enum(["submitted", "accepted", "rejected", "withdrawn"]).optional().describe("Submission status (default \"submitted\")"),
    }),
});

export const updateContestSubmissionSpec = defineTool({
    name: "update_contest_submission",
    description: "Update fields on an existing contest submission. All fields except submissionId are optional — only provided fields are changed.",
    destructive: false,
    parameters: z.object({
        submissionId: z.string().describe("The contest submission ID to update"),
        providerId: z.string().optional().describe("New provider (contest organizer) ID"),
        contestName: z.string().optional().describe("New contest name"),
        submissionDate: z.string().optional().describe("New ISO 8601 submission date/time"),
        reviewDate: z.string().optional().describe("New ISO 8601 review date/time"),
        submissionUrl: HttpUrl.optional().describe("New submission URL"),
        status: z.enum(["submitted", "accepted", "rejected", "withdrawn"]).optional().describe("New submission status"),
    }),
});

export const deleteContestSubmissionSpec = defineTool({
    name: "delete_contest_submission",
    description: "Delete a contest submission.",
    destructive: true,
    parameters: z.object({
        submissionId: z.string().describe("The contest submission ID to delete"),
    }),
});

export const listPublicationSubmissionsSpec = defineTool({
    name: "list_publication_submissions",
    description: "List publication submissions for a project (a story's submissions to publication venues), newest first.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
    }),
});

export const createPublicationSubmissionSpec = defineTool({
    name: "create_publication_submission",
    description: "Record a new publication submission for a project.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().describe("The project ID"),
        venueName: z.string().describe("Name of the publication venue"),
        submissionDate: z.string().describe("ISO 8601 date/time the story was submitted"),
        status: z.enum(["submitted", "accepted", "rejected", "withdrawn"]).optional().describe("Submission status (default \"submitted\")"),
    }),
});

export const updatePublicationSubmissionSpec = defineTool({
    name: "update_publication_submission",
    description: "Update fields on an existing publication submission. All fields except submissionId are optional — only provided fields are changed.",
    destructive: false,
    parameters: z.object({
        submissionId: z.string().describe("The publication submission ID to update"),
        venueName: z.string().optional().describe("New publication venue name"),
        submissionDate: z.string().optional().describe("New ISO 8601 submission date/time"),
        status: z.enum(["submitted", "accepted", "rejected", "withdrawn"]).optional().describe("New submission status"),
    }),
});

export const deletePublicationSubmissionSpec = defineTool({
    name: "delete_publication_submission",
    description: "Delete a publication submission.",
    destructive: true,
    parameters: z.object({
        submissionId: z.string().describe("The publication submission ID to delete"),
    }),
});
