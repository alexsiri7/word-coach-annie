import { z } from "zod";
import { PERSONAL_TOKEN_SCOPES } from "@/lib/personal-tokens";

export const AccountDeleteSchema = z.object({
  email: z.string().email("Must be a valid email address"),
});

export type AccountDeleteInput = z.infer<typeof AccountDeleteSchema>;

export const ApiTokenCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be at most 100 characters"),
  scope: z.enum(PERSONAL_TOKEN_SCOPES),
});
