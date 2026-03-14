import { prisma } from "@/lib/db";
import { GoogleDocsApi } from "../google-api";
import { exportManuscript, exportStoryBible, exportUniverse } from "../../mcp/tools/export";
import { logger } from "@/lib/logger";

export type ExportMode = 'UNIVERSE' | 'STORY_INTERNAL' | 'STORY_READER';

export class GoogleDocsExporter {

    static async exportToGoogleDocs(
        entityId: string,
        mode: ExportMode
    ): Promise<{ googleDocId: string; googleDocUrl: string }> {

        // 1. Resolve Project/Universe
        let projectId: string | null = null;
        let universeId: string | null = null;
        let title = "";

        if (mode === 'UNIVERSE') {
            const universe = await prisma.universe.findUnique({ where: { id: entityId } });
            if (!universe) throw new Error(`Universe not found: ${entityId}`);
            universeId = universe.id;
            title = universe.title;
        } else {
            const project = await prisma.project.findUnique({ where: { id: entityId } });
            if (!project) throw new Error(`Project not found: ${entityId}`);
            projectId = project.id;
            title = project.title;
        }

        // 2. Check for existing export mapping
        let exportRecord = await prisma.googleDocExport.findFirst({
            where: {
                projectId,
                universeId,
                exportMode: mode
            }
        });

        let googleDocId = exportRecord?.googleDocId;

        // 3. Create Doc if not exists
        if (!googleDocId) {
            const docTitle = `${title} - ${this.getModeLabel(mode)}`;
            googleDocId = await GoogleDocsApi.createDocument(docTitle);

            // Save mapping
            exportRecord = await prisma.googleDocExport.create({
                data: {
                    projectId,
                    universeId,
                    exportMode: mode,
                    googleDocId,
                    googleDocUrl: `https://docs.google.com/document/d/${googleDocId}/edit`,
                    lastSyncedAt: new Date()
                }
            });
        }

        // 4. Generate Content
        let content = "";
        try {
            switch (mode) {
                case 'UNIVERSE':
                    content = await exportUniverse(universeId!);
                    break;
                case 'STORY_INTERNAL':
                    // Full bible + manuscript with beats
                    const bible = await exportStoryBible(projectId!);
                    const manuscript = await exportManuscript(projectId!, { includeBeats: true });
                    content = `${bible}\n\n---\n\n# Manuscript\n\n${manuscript}`;
                    break;
                case 'STORY_READER':
                    // Clean manuscript
                    content = await exportManuscript(projectId!, { includeBeats: false });
                    break;
            }
        } catch (error) {
            logger.error("Error generating export content", error);
            throw new Error(`Failed to generate export content: ${error}`);
        }

        // 5. Update Doc Content
        try {
            await GoogleDocsApi.replaceContent(googleDocId, content);
        } catch (error: unknown) {
            // Handle 404 (doc deleted externally) -> remove mapping and retry?
            // For now, just throw.
            const message = error instanceof Error ? error.message : String(error);
            const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : undefined;
            if (code === 404 || message.includes('not found')) {
                await prisma.googleDocExport.delete({ where: { id: exportRecord!.id } });
                throw new Error("Google Doc not found. Mapping removed. Please try again to create a new doc.");
            }
            throw error;
        }

        // 6. Update timestamp
        await prisma.googleDocExport.update({
            where: { id: exportRecord!.id },
            data: { lastSyncedAt: new Date() }
        });

        return {
            googleDocId: exportRecord!.googleDocId,
            googleDocUrl: exportRecord!.googleDocUrl
        };
    }

    private static getModeLabel(mode: ExportMode): string {
        switch (mode) {
            case 'UNIVERSE': return "World Bible";
            case 'STORY_INTERNAL': return "Internal Draft (with Notes)";
            case 'STORY_READER': return "Reader Copy";
            default: return "Export";
        }
    }
}
