import { z } from "zod";
import { defineTool } from "./types";

export const getPeerReviewPromptsSpec = defineTool({
    name: "get_peer_review_prompts",
    description: "Return the prompt/lens text used by each of the four peer review agents (editor, fan, author, comedy writer). Useful for understanding what angle each reviewer takes.",
    destructive: false,
    parameters: z.object({}),
});

export const runPeerReviewSpec = defineTool({
    name: "run_peer_review",
    description: "Trigger a full peer review of the project — runs four agents (editor, fan reader, peer author, comedy writer) in parallel and stores the result. Equivalent to clicking Peer Review in the web UI. Returns the newly created PeerReview record.",
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
