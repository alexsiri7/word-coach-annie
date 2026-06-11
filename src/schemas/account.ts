import { z } from "zod";

export const AccountDeleteSchema = z.object({
  email: z.string().email("Must be a valid email address"),
});

export type AccountDeleteInput = z.infer<typeof AccountDeleteSchema>;
