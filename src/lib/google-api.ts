import { google, docs_v1, drive_v3 } from 'googleapis';
import { GoogleAuthController } from './controllers/google-auth';

interface InlineStyle {
    start: number;
    end: number;
    bold?: boolean;
    italic?: boolean;
}

interface DocBlock {
    text: string;
    paragraphStyle: string;
    inlineStyles: InlineStyle[];
    isBullet: boolean;
}

function parseInlineMarkdown(text: string): { cleanText: string; styles: InlineStyle[] } {
    const styles: InlineStyle[] = [];
    let result = '';
    let i = 0;

    while (i < text.length) {
        // Check for **bold** (double before single)
        if (text.startsWith('**', i)) {
            const closeIdx = text.indexOf('**', i + 2);
            if (closeIdx !== -1) {
                const startPos = result.length;
                const content = text.slice(i + 2, closeIdx);
                result += content;
                if (content.length > 0) {
                    styles.push({ start: startPos, end: result.length, bold: true });
                }
                i = closeIdx + 2;
                continue;
            }
        }
        // Check for *italic*
        if (text[i] === '*') {
            const closeIdx = text.indexOf('*', i + 1);
            if (closeIdx !== -1) {
                const startPos = result.length;
                const content = text.slice(i + 1, closeIdx);
                result += content;
                if (content.length > 0) {
                    styles.push({ start: startPos, end: result.length, italic: true });
                }
                i = closeIdx + 1;
                continue;
            }
        }
        result += text[i];
        i++;
    }

    return { cleanText: result, styles };
}

function parseMarkdownToBlocks(markdown: string): DocBlock[] {
    const lines = markdown.split('\n');
    const blocks: DocBlock[] = [];

    for (const line of lines) {
        let paragraphStyle = 'NORMAL_TEXT';
        let rawText = line;
        let isBullet = false;

        if (line.startsWith('### ')) {
            paragraphStyle = 'HEADING_3';
            rawText = line.slice(4);
        } else if (line.startsWith('## ')) {
            paragraphStyle = 'HEADING_2';
            rawText = line.slice(3);
        } else if (line.startsWith('# ')) {
            paragraphStyle = 'HEADING_1';
            rawText = line.slice(2);
        } else if (line.startsWith('> ')) {
            rawText = line.slice(2);
        } else if (line.startsWith('- ')) {
            isBullet = true;
            rawText = line.slice(2);
        }

        const { cleanText, styles } = parseInlineMarkdown(rawText);
        blocks.push({ text: cleanText, paragraphStyle, inlineStyles: styles, isBullet });
    }

    return blocks;
}

function buildDocsRequests(markdown: string, insertIndex: number): { plainText: string; formattingRequests: docs_v1.Schema$Request[] } {
    const blocks = parseMarkdownToBlocks(markdown);
    const formattingRequests: docs_v1.Schema$Request[] = [];

    const plainText = blocks.map(b => b.text).join('\n');

    let charIndex = insertIndex;

    for (const block of blocks) {
        const blockStart = charIndex;
        const blockTextEnd = charIndex + block.text.length;
        charIndex += block.text.length + 1; // +1 for newline

        if (block.paragraphStyle !== 'NORMAL_TEXT') {
            formattingRequests.push({
                updateParagraphStyle: {
                    range: { startIndex: blockStart, endIndex: blockTextEnd + 1 },
                    paragraphStyle: { namedStyleType: block.paragraphStyle },
                    fields: 'namedStyleType'
                }
            });
        }

        if (block.isBullet) {
            formattingRequests.push({
                createParagraphBullets: {
                    range: { startIndex: blockStart, endIndex: blockTextEnd + 1 },
                    bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE'
                }
            });
        }

        for (const style of block.inlineStyles) {
            const fields = [style.bold ? 'bold' : '', style.italic ? 'italic' : ''].filter(Boolean).join(',');
            formattingRequests.push({
                updateTextStyle: {
                    range: {
                        startIndex: blockStart + style.start,
                        endIndex: blockStart + style.end
                    },
                    textStyle: {
                        ...(style.bold !== undefined && { bold: style.bold }),
                        ...(style.italic !== undefined && { italic: style.italic })
                    },
                    fields
                }
            });
        }
    }

    return { plainText, formattingRequests };
}

export class GoogleDocsApi {

    static async createDocument(title: string): Promise<string> {
        const auth = await GoogleAuthController.getValidClient();
        if (!auth) throw new Error("Not authenticated");

        const docs = google.docs({ version: 'v1', auth });
        const res = await docs.documents.create({
            requestBody: { title }
        });

        return res.data.documentId!;
    }

    static async getDocument(documentId: string): Promise<docs_v1.Schema$Document> {
        const auth = await GoogleAuthController.getValidClient();
        if (!auth) throw new Error("Not authenticated");

        const docs = google.docs({ version: 'v1', auth });
        const res = await docs.documents.get({ documentId });
        return res.data;
    }

    static async updateDocument(documentId: string, requests: docs_v1.Schema$Request[]) {
        const auth = await GoogleAuthController.getValidClient();
        if (!auth) throw new Error("Not authenticated");

        const docs = google.docs({ version: 'v1', auth });
        await docs.documents.batchUpdate({
            documentId,
            requestBody: { requests }
        });
    }

    static async fetchComments(documentId: string): Promise<drive_v3.Schema$Comment[]> {
        const auth = await GoogleAuthController.getValidClient();
        if (!auth) throw new Error("Not authenticated");

        const drive = google.drive({ version: 'v3', auth });
        const allComments: drive_v3.Schema$Comment[] = [];
        let pageToken: string | undefined;

        do {
            const res = await drive.comments.list({
                fileId: documentId,
                fields: 'comments(id,content,quotedFileContent,author,resolved,replies,createdTime),nextPageToken',
                includeDeleted: false,
                pageToken,
            });
            allComments.push(...(res.data.comments ?? []));
            pageToken = res.data.nextPageToken ?? undefined;
        } while (pageToken);

        return allComments;
    }

    static async replaceContent(documentId: string, markdown: string) {
        const doc = await this.getDocument(documentId);
        const endIndex = doc.body?.content?.[doc.body.content.length - 1]?.endIndex || 1;

        const requests: docs_v1.Schema$Request[] = [];

        // Delete existing content (preserve mandatory trailing newline)
        if (endIndex > 2) {
            requests.push({
                deleteContentRange: {
                    range: { startIndex: 1, endIndex: endIndex - 1 }
                }
            });
        }

        if (markdown.length > 0) {
            const { plainText, formattingRequests } = buildDocsRequests(markdown, 1);

            // Insert plain text first, then apply formatting
            requests.push({
                insertText: {
                    location: { index: 1 },
                    text: plainText
                }
            });
            requests.push(...formattingRequests);
        }

        if (requests.length > 0) {
            await this.updateDocument(documentId, requests);
        }
    }
}
