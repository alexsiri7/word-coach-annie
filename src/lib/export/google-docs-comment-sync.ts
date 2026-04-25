import { prisma } from "@/lib/db";
import { GoogleDocsApi } from "../google-api";
import { logger } from "@/lib/logger";

export interface CommentSyncResult {
    imported: number;
    skipped: number;
    unresolvable: number;
    errors: string[];
}

/**
 * Strips HTML tags and normalizes whitespace for text matching.
 */
function normalizeText(text: string): string {
    return text
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Find which scene node contains the given anchor text.
 * Returns the nodeId and character offset of the first match.
 */
async function findSceneForAnchor(
    projectId: string,
    anchorText: string
): Promise<{ nodeId: string; offset: number } | null> {
    const normalized = anchorText.trim();
    if (!normalized) return null;

    // Get all scene nodes with their latest content
    const scenes = await prisma.structureNode.findMany({
        where: { projectId, type: 'SCENE' },
        select: { id: true },
    });

    for (const scene of scenes) {
        const version = await prisma.contentVersion.findFirst({
            where: { nodeId: scene.id },
            orderBy: { createdAt: 'desc' },
        });
        if (!version?.content) continue;

        const plainText = normalizeText(version.content);
        const idx = plainText.indexOf(normalized);
        if (idx !== -1) {
            return { nodeId: scene.id, offset: idx };
        }
    }

    return null;
}

export class GoogleDocsCommentSync {
    /**
     * Sync comments from a Google Doc back to Annie as annotations.
     * Skips comments already imported (tracked via Annotation.externalId).
     * Returns a summary of what happened.
     */
    static async syncComments(projectId: string, userId?: string | null): Promise<CommentSyncResult> {
        const result: CommentSyncResult = {
            imported: 0,
            skipped: 0,
            unresolvable: 0,
            errors: [],
        };

        // Find the export record for this project (prefer STORY_READER, fallback to STORY_INTERNAL)
        const exportRecord = await prisma.googleDocExport.findFirst({
            where: {
                projectId,
                exportMode: { in: ['STORY_READER', 'STORY_INTERNAL'] },
            },
            orderBy: { lastSyncedAt: 'desc' },
        });

        if (!exportRecord) {
            throw new Error("No Google Doc export found for this project. Export the project first.");
        }

        let comments;
        try {
            comments = await GoogleDocsApi.fetchComments(exportRecord.googleDocId, userId);
        } catch (error) {
            throw new Error(`Failed to fetch comments from Google Docs: ${error instanceof Error ? error.message : error}`);
        }

        for (const comment of comments) {
            if (!comment.id || !comment.content) continue;

            // Build a stable external ID: exportRecord.id + ":" + comment.id
            const externalId = `gdoc:${exportRecord.googleDocId}:${comment.id}`;

            // Skip already-imported comments
            const existing = await prisma.annotation.findUnique({
                where: { externalId },
            });
            if (existing) {
                result.skipped++;
                continue;
            }

            // Get anchor text from the comment's quotedFileContent
            const anchorText = comment.quotedFileContent?.value ?? "";
            const authorName = comment.author?.displayName ?? "Google Docs";

            // Find matching scene
            const match = anchorText
                ? await findSceneForAnchor(projectId, normalizeText(anchorText))
                : null;

            if (!match && anchorText) {
                // Comment has anchor text but we can't find the scene (content may have changed)
                result.unresolvable++;
                logger.warn(`Could not map Google Docs comment ${comment.id} anchor to any scene`);
                continue;
            }

            if (!match) {
                // No anchor text - skip (document-level comments without a quote)
                result.skipped++;
                continue;
            }

            // Format content: include author name and any replies
            let content = `[${authorName}]: ${comment.content}`;
            if (comment.replies && comment.replies.length > 0) {
                const replyLines = comment.replies
                    .filter((r) => r.content)
                    .map((r) => `  ↳ [${r.author?.displayName ?? "Reply"}]: ${r.content}`)
                    .join("\n");
                if (replyLines) content += "\n" + replyLines;
            }

            try {
                await prisma.annotation.create({
                    data: {
                        id: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        nodeId: match.nodeId,
                        content,
                        range: String(match.offset),
                        selectedText: anchorText.slice(0, 500), // cap length
                        externalId,
                        resolved: comment.resolved === true,
                        updatedAt: new Date(),
                    },
                });
                result.imported++;
            } catch (error) {
                result.errors.push(`Failed to create annotation for comment ${comment.id}: ${error}`);
                logger.error("Failed to create annotation from Google Docs comment", error);
            }
        }

        // Update lastCommentSyncAt on the export record
        await prisma.googleDocExport.update({
            where: { id: exportRecord.id },
            data: { lastCommentSyncAt: new Date() },
        });

        return result;
    }

    /**
     * Get Google Doc export info for a project.
     */
    static async getExportInfo(projectId: string) {
        return prisma.googleDocExport.findMany({
            where: { projectId },
            select: {
                id: true,
                exportMode: true,
                googleDocUrl: true,
                lastSyncedAt: true,
                lastCommentSyncAt: true,
            },
            orderBy: { lastSyncedAt: 'desc' },
        });
    }
}
