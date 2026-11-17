import { z } from "zod";

// Upper bounds are sanity caps, not product limits: no real session writes a
// million words, and the client ends a session after inactivity, so none lasts a day.
export const MAX_SESSION_WORDS = 1_000_000;
export const MAX_SESSION_SECONDS = 86_400;

// Sessions are stamped by the browser's clock, which may run ahead of the server's;
// the scene editor ignores the response, so a rejection would silently lose the session.
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

const latestAcceptable = () => new Date(Date.now() + CLOCK_SKEW_TOLERANCE_MS);

const notFutureInstant = (value: string) => new Date(value) <= latestAcceptable();

// `date` is the UTC calendar day the client recorded, so it is compared as a string.
const notFutureDay = (value: string) => value <= latestAcceptable().toISOString().slice(0, 10);

export const SessionCreateSchema = z.object({
  nodeId: z.string().min(1, "nodeId must be non-empty").nullable().optional(),
  startedAt: z.iso.datetime({ offset: true }).refine(notFutureInstant, "startedAt cannot be in the future").optional(),
  endedAt: z.iso.datetime({ offset: true }).refine(notFutureInstant, "endedAt cannot be in the future").optional(),
  wordsWritten: z.number().int().min(0).max(MAX_SESSION_WORDS).optional(),
  durationSeconds: z.number().int().min(0).max(MAX_SESSION_SECONDS).optional(),
  date: z.iso.date().refine(notFutureDay, "date cannot be in the future").optional(),
});

export type SessionCreateInput = z.infer<typeof SessionCreateSchema>;
