import { z } from "zod";

// Upper bounds are sanity caps, not product limits: no real session writes a
// million words, and the client ends a session after inactivity, so none lasts a day.
export const MAX_SESSION_WORDS = 1_000_000;
export const MAX_SESSION_SECONDS = 86_400;

export const SessionCreateSchema = z.object({
  nodeId: z.string().min(1, "nodeId must be non-empty").nullable().optional(),
  startedAt: z.iso.datetime({ offset: true }).optional(),
  endedAt: z.iso.datetime({ offset: true }).optional(),
  wordsWritten: z.number().int().min(0).max(MAX_SESSION_WORDS).optional(),
  durationSeconds: z.number().int().min(0).max(MAX_SESSION_SECONDS).optional(),
  date: z.iso.date().optional(),
});

export type SessionCreateInput = z.infer<typeof SessionCreateSchema>;
