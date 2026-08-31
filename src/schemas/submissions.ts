import { z } from "zod";

export const SubmissionStatus = z.enum(["submitted", "accepted", "rejected", "withdrawn"]);

// Provider
export const ProviderCreateSchema = z.object({
    name: z.string().min(1, "name is required"),
    website: z.string().optional(),
    notes: z.string().optional(),
});

export const ProviderUpdateSchema = z.object({
    name: z.string().min(1, "name must be non-empty").optional(),
    website: z.string().optional(),
    notes: z.string().optional(),
});

// ContestSubmission
export const ContestSubmissionCreateSchema = z.object({
    providerId: z.string().min(1, "providerId is required"),
    contestName: z.string().min(1, "contestName is required"),
    submissionDate: z.iso.datetime({ message: "submissionDate must be ISO 8601" }),
    reviewDate: z.iso.datetime({ message: "reviewDate must be ISO 8601" }).optional(),
    submissionUrl: z.string().optional(),
    status: SubmissionStatus.optional().default("submitted"),
});

export const ContestSubmissionUpdateSchema = z.object({
    providerId: z.string().min(1).optional(),
    contestName: z.string().min(1, "contestName must be non-empty").optional(),
    submissionDate: z.iso.datetime().optional(),
    // null = explicitly clear the review date; absent = no change
    reviewDate: z.iso.datetime().nullable().optional(),
    submissionUrl: z.string().optional(),
    status: SubmissionStatus.optional(),
});

// PublicationSubmission
export const PublicationSubmissionCreateSchema = z.object({
    venueName: z.string().min(1, "venueName is required"),
    submissionDate: z.iso.datetime({ message: "submissionDate must be ISO 8601" }),
    status: SubmissionStatus.optional().default("submitted"),
});

export const PublicationSubmissionUpdateSchema = z.object({
    venueName: z.string().min(1, "venueName must be non-empty").optional(),
    submissionDate: z.iso.datetime().optional(),
    status: SubmissionStatus.optional(),
});

export type ProviderCreateInput = z.infer<typeof ProviderCreateSchema>;
export type ProviderUpdateInput = z.infer<typeof ProviderUpdateSchema>;
export type ContestSubmissionCreateInput = z.infer<typeof ContestSubmissionCreateSchema>;
export type ContestSubmissionUpdateInput = z.infer<typeof ContestSubmissionUpdateSchema>;
export type PublicationSubmissionCreateInput = z.infer<typeof PublicationSubmissionCreateSchema>;
export type PublicationSubmissionUpdateInput = z.infer<typeof PublicationSubmissionUpdateSchema>;
