import { logger } from "@/lib/logger";
import { toolError } from "@/mcp/tool-errors";
import { exportManuscript, exportStoryBible, getProjectSummary } from "@/mcp/tools/export";
import { GoogleDocsExporter } from "@/lib/export/google-docs-exporter";
import {
    assertProjectOwner as verifyProjectOwnership,
    assertUniverseOwner as verifyUniverseOwnership,
} from "@/lib/ownership";
import {
    exportManuscriptSpec,
    exportStoryBibleSpec,
    exportHashnodeSpec,
    getProjectSummarySpec,
    exportToGoogleDocsSpec,
} from "@/lib/ai/tool-catalog/export";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerExportTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, exportManuscriptSpec, async ({ projectId }) => {
        await verifyProjectOwnership(projectId, userId);
        const markdown = await exportManuscript(projectId);
        return { content: [{ type: "text", text: markdown }] };
    });

    registerTool(ctx, exportStoryBibleSpec, async ({ projectId }) => {
        await verifyProjectOwnership(projectId, userId);
        const markdown = await exportStoryBible(projectId);
        return { content: [{ type: "text", text: markdown }] };
    });

    registerTool(ctx, exportHashnodeSpec, async ({ projectId, nodeId }) => {
        await verifyProjectOwnership(projectId, userId);
        const { exportHashnode } = await import("@/mcp/tools/export");
        const markdown = await exportHashnode(projectId, nodeId);
        return { content: [{ type: "text", text: markdown }] };
    });

    registerTool(ctx, getProjectSummarySpec, async ({ projectId }) => {
        await verifyProjectOwnership(projectId, userId);
        const result = await getProjectSummary(projectId);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });

    registerTool(ctx, exportToGoogleDocsSpec, async ({ projectId, universeId, exportMode }) => {
        if (!projectId && !universeId) {
            return { content: [{ type: "text", text: "Either projectId or universeId must be provided." }], isError: true };
        }
        if (exportMode === 'UNIVERSE' && !universeId) {
            return { content: [{ type: "text", text: "universeId is required for UNIVERSE mode." }], isError: true };
        }
        if (exportMode !== 'UNIVERSE' && !projectId) {
            return { content: [{ type: "text", text: "projectId is required for STORY modes." }], isError: true };
        }

        try {
            if (exportMode === 'UNIVERSE') {
                await verifyUniverseOwnership(universeId!, userId);
            } else {
                await verifyProjectOwnership(projectId!, userId);
            }
            const entityId = exportMode === 'UNIVERSE' ? universeId! : projectId!;
            const result = await GoogleDocsExporter.exportToGoogleDocs(entityId, exportMode as "UNIVERSE" | "STORY_INTERNAL" | "STORY_READER", userId);
            return { content: [{ type: "text", text: `Export successful! Document: ${result.googleDocUrl}` }] };
        } catch (e) {
            logger.error("export_to_google_docs: export failed", e);
            return toolError("Export failed", e);
        }
    });
}
