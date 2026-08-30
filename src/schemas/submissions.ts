import { z } from "zod";

export const SubmissionStatus = z.enum(["submitted", "accepted", "rejected", "withdrawn"]);

export const ProviderCreateSchema = z.object({
  name: z.string().min(1, "name is required"),
  website: z.string().url("website must be a valid URL").optional(),
  notes: z.string().optional(),
});

export const ProviderUpdateSchema = z.object({
  name: z.string().min(1, "name must be non-empty").optional(),
  website: z.string().url("website must be a valid URL").optional().nullable(),
  notes: z.string().optional(),
});

export const PublicationSubmissionCreateSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  venueName: z.string().min(1, "venueName is required"),
  submissionDate: z.string().datetime({ message: "submissionDate must be ISO 8601" }),
  status: SubmissionStatus.optional().default("submitted"),
  notes: z.string().optional(),
});

export const PublicationSubmissionUpdateSchema = z.object({
  venueName: z.string().min(1, "venueName must be non-empty").optional(),
  submissionDate: z.string().datetime().optional(),
  status: SubmissionStatus.optional(),
  notes: z.string().optional(),
});

export const ContestSubmissionCreateSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  providerId: z.string().min(1, "providerId is required"),
  contestName: z.string().min(1, "contestName is required"),
  submissionDate: z.string().datetime({ message: "submissionDate must be ISO 8601" }),
  reviewDate: z.string().datetime().optional(),
  submissionUrl: z.string().url("submissionUrl must be a valid URL").optional(),
  status: SubmissionStatus.optional().default("submitted"),
  notes: z.string().optional(),
});

export const ContestSubmissionUpdateSchema = z.object({
  contestName: z.string().min(1, "contestName must be non-empty").optional(),
  providerId: z.string().min(1).optional(),
  submissionDate: z.string().datetime().optional(),
  reviewDate: z.string().datetime().optional().nullable(),
  submissionUrl: z.string().url().optional().nullable(),
  status: SubmissionStatus.optional(),
  notes: z.string().optional(),
});
