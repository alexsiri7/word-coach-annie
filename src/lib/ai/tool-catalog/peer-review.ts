import { z } from "zod";
import { defineTool } from "./types";

export const getPeerReviewPromptsSpec = defineTool({
    name: "get_peer_review_prompts",
    description: "Return the prompt/lens text used by each of the five peer review agents (editor, fan, author, comedy writer, acting coach). Useful for understanding what angle each reviewer takes.",
    destructive: false,
    parameters: z.object({}),
});

export const runPeerReviewSpec = defineTool({
    name: "run_peer_review",
    description: "Trigger a full peer review of the project — five reviewer personas (acquisitions editor, fan reader, peer author, acting coach, comedy writer) read it in parallel, then a consensus is synthesised and the result is stored. Equivalent to clicking Peer Review in the web UI. Returns the newly created PeerReview record; if a peer review is already running for this project, returns that run's record instead of starting another.",
    destructive: false,
    parameters: z.object({ projectId: z.string() }),
});

export const getPeerReviewsSpec = defineTool({
    name: "get_peer_reviews",
    description: "Return stored peer review results for a project, newest first. Use `run_peer_review` to generate a new one if none exist.",
    destructive: false,
    parameters: z.object({
        projectId: z.string(),
        limit: z.number().int().optional().default(5).describe("Max reviews to return (1–20, default 5, max 20)"),
    }),
});
