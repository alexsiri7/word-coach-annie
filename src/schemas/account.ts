import { z } from "zod";

export const AccountDeleteSchema = z.object({
  email: z.string().email("Must be a valid email address"),
});

export type AccountDeleteInput = z.infer<typeof AccountDeleteSchema>;

export const ApiTokenCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  scope: z.enum(["read", "write"]),
});
