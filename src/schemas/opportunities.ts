import { z } from "zod";

export const OpportunityStatus = z.enum(["found", "considering", "closed"]);
export const CandidateState = z.enum(["candidate", "chosen", "dropped"]);

// Opportunity
export const OpportunityCreateSchema = z.object({
    providerId: z.string().min(1, "providerId is required"),
    title: z.string().min(1, "title is required"),
    closeDate: z.iso.datetime({ message: "closeDate must be ISO 8601" }),
    reviewDate: z.iso.datetime({ message: "reviewDate must be ISO 8601" }).optional(),
    rulesUrl: z.string().optional(),
    entryFee: z.string().optional(),
    wordLimit: z.number().int().positive().optional(),
    lineLimit: z.number().int().positive().optional(),
    genreRestrictions: z.string().optional(),
    eligibilityNotes: z.string().optional(),
    status: OpportunityStatus.optional().default("found"),
});

// Nullable fields accept an explicit null to clear a value recorded earlier.
export const OpportunityUpdateSchema = z.object({
    providerId: z.string().min(1).optional(),
    title: z.string().min(1, "title must be non-empty").optional(),
    closeDate: z.iso.datetime({ message: "closeDate must be ISO 8601" }).optional(),
    reviewDate: z.iso.datetime({ message: "reviewDate must be ISO 8601" }).nullable().optional(),
    rulesUrl: z.string().nullable().optional(),
    entryFee: z.string().nullable().optional(),
    wordLimit: z.number().int().positive().nullable().optional(),
    lineLimit: z.number().int().positive().nullable().optional(),
    genreRestrictions: z.string().nullable().optional(),
    eligibilityNotes: z.string().nullable().optional(),
    status: OpportunityStatus.optional(),
});

// OpportunityCandidate
export const CandidateCreateSchema = z.object({
    projectId: z.string().min(1, "projectId is required"),
    state: CandidateState.optional().default("candidate"),
    notes: z.string().optional(),
});

export const CandidateUpdateSchema = z.object({
    state: CandidateState.optional(),
    notes: z.string().nullable().optional(),
});

export type OpportunityStatusValue = z.infer<typeof OpportunityStatus>;
export type CandidateStateValue = z.infer<typeof CandidateState>;
export type OpportunityCreateInput = z.infer<typeof OpportunityCreateSchema>;
export type OpportunityUpdateInput = z.infer<typeof OpportunityUpdateSchema>;
export type CandidateCreateInput = z.infer<typeof CandidateCreateSchema>;
export type CandidateUpdateInput = z.infer<typeof CandidateUpdateSchema>;
