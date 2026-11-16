import { listSkills } from "@/mcp/skills";
import { logger } from "@/lib/logger";
import { mcpRun, toolError } from "@/mcp/tool-errors";
import { CLAUDE_COLLABORATION_INSTRUCTIONS } from "@/mcp/annie-voice";
import { REVIEW_PERSONAS } from "@/lib/review-personas";
import { prisma } from "@/lib/db";
import { runPeerReview } from "@/lib/ai/peer-review-service";
import { assertProjectOwner as verifyProjectOwnership } from "@/lib/ownership";
import { listSkillsSpec, getInitialInstructionsSpec } from "@/lib/ai/tool-catalog/skills";
import { getPeerReviewPromptsSpec, runPeerReviewSpec, getPeerReviewsSpec } from "@/lib/ai/tool-catalog/peer-review";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerSkillTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, listSkillsSpec, async () => {
        const skills = listSkills();
        return { content: [{ type: "text", text: JSON.stringify(skills, null, 2) }] };
    });

    registerTool(ctx, getInitialInstructionsSpec, async () => {
        return { content: [{ type: "text", text: CLAUDE_COLLABORATION_INSTRUCTIONS }] };
    });

    registerTool(ctx, getPeerReviewPromptsSpec, async () => {
        const display = Object.fromEntries(
            Object.entries(REVIEW_PERSONAS).map(([id, { mode, lens }]) => [
                id,
                { mode, lens: lens("your project") },
            ])
        );
        return { content: [{ type: "text", text: JSON.stringify(display, null, 2) }] };
    });

    registerTool(ctx, runPeerReviewSpec, async ({ projectId }) =>
        mcpRun("run_peer_review", "Error running peer review", async () => {
            await verifyProjectOwnership(projectId, userId);
            return runPeerReview(projectId);
        }));

    registerTool(ctx, getPeerReviewsSpec, async ({ projectId, limit }) => {
        const clampedLimit = Math.min(Math.max(limit, 1), 20);
        try {
            await verifyProjectOwnership(projectId, userId);
            const rows = await prisma.peerReview.findMany({
                where: { projectId },
                orderBy: { createdAt: "desc" },
                take: clampedLimit,
            });
            return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
        } catch (e) {
            logger.error("get_peer_reviews: failed", e);
            return toolError("Error fetching peer reviews", e);
        }
    });
}
