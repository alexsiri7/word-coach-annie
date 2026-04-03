import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { exportMedium } from '@/mcp/tools/export';

const MEDIUM_API_BASE = 'https://api.medium.com/v1';

export interface PublishToMediumOptions {
    nodeId?: string;
    titleOverride?: string;
    publishStatus?: 'draft' | 'public' | 'unlisted';
    tags?: string[];
    canonicalUrl?: string;
}

export interface PublishResult {
    mediumPostId: string;
    mediumPostUrl: string;
    publishStatus: string;
    alreadyPublished?: boolean;
}

export class MediumPublishController {
    static async publish(
        projectId: string,
        userId: string | null,
        options: PublishToMediumOptions = {}
    ): Promise<PublishResult> {
        const { nodeId, titleOverride, publishStatus = 'draft', tags = [], canonicalUrl } = options;

        // Get credential
        const where = userId ? { userId } : { userId: 'local' };
        const cred = await prisma.mediumCredential.findUnique({ where });
        if (!cred) {
            throw new Error('Medium account not connected');
        }

        // Determine title
        let title: string;
        if (titleOverride) {
            title = titleOverride;
        } else if (nodeId) {
            const node = await prisma.structureNode.findUnique({
                where: { id: nodeId },
                select: { title: true },
            });
            if (!node) throw new Error(`Node not found: ${nodeId}`);
            title = node.title;
        } else {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                select: { title: true },
            });
            if (!project) throw new Error(`Project not found: ${projectId}`);
            title = project.title;
        }

        // Validate title length (Medium truncates at 100 chars)
        if (title.length > 100) {
            throw new Error(`Title exceeds 100 characters (${title.length}). Medium will truncate it — please shorten before publishing.`);
        }

        // Validate tags
        if (tags.length > 3) {
            throw new Error('Medium allows a maximum of 3 tags');
        }

        // Check for existing export (re-publish guard)
        const existingExport = await prisma.mediumExport.findFirst({
            where: { projectId, nodeId: nodeId ?? null, credentialId: cred.id },
        });
        if (existingExport) {
            return {
                mediumPostId: existingExport.mediumPostId,
                mediumPostUrl: existingExport.mediumPostUrl,
                publishStatus: existingExport.publishStatus,
                alreadyPublished: true,
            };
        }

        // Generate content
        const content = await exportMedium(projectId, nodeId);

        // Publish to Medium
        const integrationToken = decrypt(cred.integrationToken);
        const body: Record<string, unknown> = {
            title,
            contentFormat: 'markdown',
            content,
            publishStatus,
        };
        if (tags.length > 0) body.tags = tags;
        if (canonicalUrl) body.canonicalUrl = canonicalUrl;

        const response = await fetch(`${MEDIUM_API_BASE}/users/${cred.authorId}/posts`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${integrationToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Medium API error (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        const post = result.data;

        // Store export record
        await prisma.mediumExport.create({
            data: {
                projectId,
                nodeId: nodeId ?? null,
                mediumPostId: post.id,
                mediumPostUrl: post.url,
                publishStatus: post.publishStatus ?? publishStatus,
                lastSyncedAt: new Date(),
                credentialId: cred.id,
            },
        });

        return {
            mediumPostId: post.id,
            mediumPostUrl: post.url,
            publishStatus: post.publishStatus ?? publishStatus,
        };
    }
}
