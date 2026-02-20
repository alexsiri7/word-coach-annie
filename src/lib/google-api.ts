import { google, docs_v1, drive_v3 } from 'googleapis';
import { GoogleAuthController } from './controllers/google-auth';

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

    static async replaceContent(documentId: string, text: string) {
        // Strategy: Delete everything, then insert text.
        // However, Google Docs requires at least one character (usually newline) at end.
        // The "end of segment" index is confusing.
        // A simpler approach for "replace body":
        // 1. Get doc to find end index.
        // 2. Delete from index 1 to endIndex - 1. (Index 0 is start?? Actually start index is 1 for body?)

        // Let's first just append if empty, or try to wipe.
        // For MVP/FR8, we want "idempotent sync". Replacing content is key.

        const doc = await this.getDocument(documentId);
        const endIndex = doc.body?.content?.[doc.body.content.length - 1]?.endIndex || 1;

        const requests: docs_v1.Schema$Request[] = [];

        // Delete existing content if any (except the final newline which is mandatory)
        if (endIndex > 2) {
            requests.push({
                deleteContentRange: {
                    range: {
                        startIndex: 1,
                        endIndex: endIndex - 1
                    }
                }
            });
        }

        // Insert new text
        if (text.length > 0) {
            requests.push({
                insertText: {
                    location: { index: 1 },
                    text: text
                }
            });
        }

        if (requests.length > 0) {
            await this.updateDocument(documentId, requests);
        }
    }
}
