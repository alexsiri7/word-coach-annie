import { z } from "zod";

export const AccountDeleteSchema = z.object({
  confirmEmail: z.string().email("Must be a valid email address"),
});
