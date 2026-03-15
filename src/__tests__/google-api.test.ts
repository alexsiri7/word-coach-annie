import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock googleapis before importing
vi.mock("googleapis", () => {
    const mockDocs = {
        documents: {
            create: vi.fn(),
            get: vi.fn(),
            batchUpdate: vi.fn(),
        },
    };
    return {
        google: {
            docs: vi.fn(() => mockDocs),
        },
        docs_v1: {},
    };
});

// Mock GoogleAuthController
vi.mock("@/lib/controllers/google-auth", () => ({
    GoogleAuthController: {
        getValidClient: vi.fn(),
    },
}));

import { GoogleDocsApi } from "@/lib/google-api";
import { google } from "googleapis";
import { GoogleAuthController } from "@/lib/controllers/google-auth";

describe("GoogleDocsApi", () => {
    const mockAuth = { credentials: { access_token: "test-token" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockDocs = (google.docs as any)();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("createDocument", () => {
        it("creates a document and returns its ID", async () => {
            vi.mocked(GoogleAuthController.getValidClient).mockResolvedValue(mockAuth as never);
            vi.mocked(mockDocs.documents.create).mockResolvedValue({
                data: { documentId: "doc-123" },
            } as never);

            const result = await GoogleDocsApi.createDocument("Test Doc");
            expect(result).toBe("doc-123");
            expect(mockDocs.documents.create).toHaveBeenCalledWith({
                requestBody: { title: "Test Doc" },
            });
        });

        it("throws when not authenticated", async () => {
            vi.mocked(GoogleAuthController.getValidClient).mockResolvedValue(null as never);
            await expect(GoogleDocsApi.createDocument("Test")).rejects.toThrow("Not authenticated");
        });
    });

    describe("getDocument", () => {
        it("fetches and returns document data", async () => {
            vi.mocked(GoogleAuthController.getValidClient).mockResolvedValue(mockAuth as never);
            const docData = { documentId: "doc-123", title: "Test" };
            vi.mocked(mockDocs.documents.get).mockResolvedValue({
                data: docData,
            } as never);

            const result = await GoogleDocsApi.getDocument("doc-123");
            expect(result).toEqual(docData);
            expect(mockDocs.documents.get).toHaveBeenCalledWith({ documentId: "doc-123" });
        });

        it("throws when not authenticated", async () => {
            vi.mocked(GoogleAuthController.getValidClient).mockResolvedValue(null as never);
            await expect(GoogleDocsApi.getDocument("doc-123")).rejects.toThrow("Not authenticated");
        });
    });

    describe("updateDocument", () => {
        it("sends batch update requests", async () => {
            vi.mocked(GoogleAuthController.getValidClient).mockResolvedValue(mockAuth as never);
            vi.mocked(mockDocs.documents.batchUpdate).mockResolvedValue({} as never);

            const requests = [{ insertText: { location: { index: 1 }, text: "Hello" } }];
            await GoogleDocsApi.updateDocument("doc-123", requests);

            expect(mockDocs.documents.batchUpdate).toHaveBeenCalledWith({
                documentId: "doc-123",
                requestBody: { requests },
            });
        });

        it("throws when not authenticated", async () => {
            vi.mocked(GoogleAuthController.getValidClient).mockResolvedValue(null as never);
            await expect(GoogleDocsApi.updateDocument("doc-123", [])).rejects.toThrow(
                "Not authenticated"
            );
        });
    });

    describe("replaceContent", () => {
        it("replaces content in document with existing content", async () => {
            vi.mocked(GoogleAuthController.getValidClient).mockResolvedValue(mockAuth as never);
            vi.mocked(mockDocs.documents.get).mockResolvedValue({
                data: {
                    body: {
                        content: [
                            { endIndex: 1 },
                            { endIndex: 50 },
                        ],
                    },
                },
            } as never);
            vi.mocked(mockDocs.documents.batchUpdate).mockResolvedValue({} as never);

            await GoogleDocsApi.replaceContent("doc-123", "New content");

            expect(mockDocs.documents.batchUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    documentId: "doc-123",
                    requestBody: {
                        requests: [
                            {
                                deleteContentRange: {
                                    range: { startIndex: 1, endIndex: 49 },
                                },
                            },
                            {
                                insertText: {
                                    location: { index: 1 },
                                    text: "New content",
                                },
                            },
                        ],
                    },
                })
            );
        });

        it("inserts content without deleting when document is empty", async () => {
            vi.mocked(GoogleAuthController.getValidClient).mockResolvedValue(mockAuth as never);
            vi.mocked(mockDocs.documents.get).mockResolvedValue({
                data: {
                    body: {
                        content: [{ endIndex: 1 }],
                    },
                },
            } as never);
            vi.mocked(mockDocs.documents.batchUpdate).mockResolvedValue({} as never);

            await GoogleDocsApi.replaceContent("doc-123", "Hello");

            // Should only have insertText, no deleteContentRange
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const call = vi.mocked(mockDocs.documents.batchUpdate).mock.calls[0][0] as any;
            expect(call.requestBody.requests).toHaveLength(1);
            expect(call.requestBody.requests[0].insertText).toBeDefined();
        });

        it("does nothing when document is empty and text is empty", async () => {
            vi.mocked(GoogleAuthController.getValidClient).mockResolvedValue(mockAuth as never);
            vi.mocked(mockDocs.documents.get).mockResolvedValue({
                data: {
                    body: {
                        content: [{ endIndex: 1 }],
                    },
                },
            } as never);

            await GoogleDocsApi.replaceContent("doc-123", "");

            expect(mockDocs.documents.batchUpdate).not.toHaveBeenCalled();
        });
    });
});
