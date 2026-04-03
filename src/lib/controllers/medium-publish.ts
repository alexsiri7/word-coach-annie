import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { exportMedium } from '@/mcp/tools/export';

const MEDIUM_API_BASE = 'https://api.medium.com/v1';

export interface PublishToMediumOptions {
    projectId: string;
    nodeId?: string;
    titleOverride?: string;
    publishStatus?: 'draft' | 'public' | 'unlisted';
    tags?: string[];
    canonicalUrl?: string;
}

export interface PublishToMediumResult {
    mediumPostId: string;
    mediumPostUrl: string;
    publishStatus: string;
    alreadyPublished?: boolean;
}

export class MediumPublishController {
    static async publish(
        options: PublishToMediumOptions,
        userId: string | null
    ): Promise<PublishToMediumResult> {
        const { projectId, nodeId, titleOverride, publishStatus = 'draft', tags = [], canonicalUrl } = options;

        // Fetch credential
        const credWhere = userId ? { userId } : { userId: 'local' };
        const credential = await prisma.mediumCredential.findUnique({ where: credWhere });
        if (!credential) {
            throw new Error('Medium account not connected');
        }

        // Validate tags (Medium allows max 3)
        if (tags.length > 3) {
            throw new Error('Maximum 3 tags allowed by Medium');
        }

        // Check for existing export (warn on re-publish)
        const existingExport = await prisma.mediumExport.findFirst({
            where: { projectId, nodeId: nodeId ?? null, credentialId: credential.id },
        });
        if (existingExport) {
            return {
                mediumPostId: existingExport.mediumPostId,
                mediumPostUrl: existingExport.mediumPostUrl,
                publishStatus: existingExport.publishStatus,
                alreadyPublished: true,
            };
        }

        // Get project for title
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) {
            throw new Error('Project not found');
        }

        // Determine title
        let title = titleOverride || project.title;
        if (title.length > 100) {
            throw new Error('Title exceeds 100 characters (Medium limit). Please provide a shorter title.');
        }

        // Generate content via existing exportMedium()
        const content = await exportMedium(projectId, nodeId);
        if (!content) {
            throw new Error('No content to publish — project has no written scenes');
        }

        // Call Medium API
        const integrationToken = decrypt(credential.integrationToken);
        const mediumBody: Record<string, unknown> = {
            title,
            contentFormat: 'markdown',
            content,
            publishStatus,
        };
        if (tags.length > 0) mediumBody.tags = tags;
        if (canonicalUrl) mediumBody.canonicalUrl = canonicalUrl;

        const response = await fetch(
            `${MEDIUM_API_BASE}/users/${credential.authorId}/posts`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${integrationToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(mediumBody),
            }
        );

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Medium API error (${response.status}): ${body}`);
        }

        const responseData = await response.json();
        const post = responseData.data;
        const mediumPostId: string = post.id;
        const mediumPostUrl: string = post.url;

        // Store in MediumExport
        await prisma.mediumExport.create({
            data: {
                projectId,
                nodeId: nodeId ?? null,
                mediumPostId,
                mediumPostUrl,
                publishStatus,
                lastSyncedAt: new Date(),
                credentialId: credential.id,
            },
        });

        return { mediumPostId, mediumPostUrl, publishStatus };
    }
}
