import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock GoogleDocsApi
vi.mock("@/lib/google-api", () => ({
    GoogleDocsApi: {
        createDocument: vi.fn(),
        replaceContent: vi.fn(),
    },
}));

// Mock export tools
vi.mock("../../src/mcp/tools/export", () => ({
    exportManuscript: vi.fn(),
    exportStoryBible: vi.fn(),
    exportUniverse: vi.fn(),
}));

import { GoogleDocsExporter } from "@/lib/export/google-docs-exporter";
import { GoogleDocsApi } from "@/lib/google-api";
import { exportManuscript, exportStoryBible, exportUniverse } from "../mcp/tools/export";
import { ProjectsController } from "@/lib/controllers/projects";
import { prisma } from "@/lib/db";

describe("GoogleDocsExporter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("exportToGoogleDocs - STORY_READER mode", () => {
        it("creates new doc and exports manuscript", async () => {
            const project = await ProjectsController.createProject({ title: "My Novel" });

            vi.mocked(GoogleDocsApi.createDocument).mockResolvedValue("new-doc-id");
            vi.mocked(GoogleDocsApi.replaceContent).mockResolvedValue(undefined);
            vi.mocked(exportManuscript).mockResolvedValue("Chapter 1\n\nOnce upon a time...");

            const result = await GoogleDocsExporter.exportToGoogleDocs(project.id, "STORY_READER");

            expect(result.googleDocId).toBe("new-doc-id");
            expect(result.googleDocUrl).toContain("new-doc-id");
            expect(GoogleDocsApi.createDocument).toHaveBeenCalledWith("My Novel - Reader Copy", undefined);
            expect(exportManuscript).toHaveBeenCalledWith(project.id, { includeBeats: false });
            expect(GoogleDocsApi.replaceContent).toHaveBeenCalledWith(
                "new-doc-id",
                "Chapter 1\n\nOnce upon a time...",
                undefined
            );
        });
    });

    describe("exportToGoogleDocs - STORY_INTERNAL mode", () => {
        it("exports bible + manuscript with beats", async () => {
            const project = await ProjectsController.createProject({ title: "My Novel" });

            vi.mocked(GoogleDocsApi.createDocument).mockResolvedValue("doc-internal");
            vi.mocked(GoogleDocsApi.replaceContent).mockResolvedValue(undefined);
            vi.mocked(exportStoryBible).mockResolvedValue("Bible content");
            vi.mocked(exportManuscript).mockResolvedValue("Manuscript content");

            const result = await GoogleDocsExporter.exportToGoogleDocs(project.id, "STORY_INTERNAL");

            expect(result.googleDocId).toBe("doc-internal");
            expect(GoogleDocsApi.createDocument).toHaveBeenCalledWith(
                "My Novel - Internal Draft (with Notes)",
                undefined
            );
            expect(exportStoryBible).toHaveBeenCalledWith(project.id);
            expect(exportManuscript).toHaveBeenCalledWith(project.id, { includeBeats: true });
        });
    });

    describe("exportToGoogleDocs - UNIVERSE mode", () => {
        it("exports universe content", async () => {
            const universe = await prisma.universe.create({
                data: { title: "My Universe" },
            });

            vi.mocked(GoogleDocsApi.createDocument).mockResolvedValue("doc-universe");
            vi.mocked(GoogleDocsApi.replaceContent).mockResolvedValue(undefined);
            vi.mocked(exportUniverse).mockResolvedValue("Universe bible content");

            const result = await GoogleDocsExporter.exportToGoogleDocs(universe.id, "UNIVERSE");

            expect(result.googleDocId).toBe("doc-universe");
            expect(GoogleDocsApi.createDocument).toHaveBeenCalledWith("My Universe - World Bible", undefined);
            expect(exportUniverse).toHaveBeenCalledWith(universe.id);
        });
    });

    describe("error handling", () => {
        it("throws for non-existent project", async () => {
            await expect(
                GoogleDocsExporter.exportToGoogleDocs("bad-id", "STORY_READER")
            ).rejects.toThrow("Project not found");
        });

        it("throws for non-existent universe", async () => {
            await expect(
                GoogleDocsExporter.exportToGoogleDocs("bad-id", "UNIVERSE")
            ).rejects.toThrow("Universe not found");
        });

        it("throws on export content generation failure", async () => {
            const project = await ProjectsController.createProject({ title: "Fail" });

            vi.mocked(GoogleDocsApi.createDocument).mockResolvedValue("doc-fail");
            vi.mocked(exportManuscript).mockRejectedValue(new Error("export failed"));

            await expect(
                GoogleDocsExporter.exportToGoogleDocs(project.id, "STORY_READER")
            ).rejects.toThrow("Failed to generate export content");
        });

        it("removes mapping and throws on 404 from Google", async () => {
            const project = await ProjectsController.createProject({ title: "Gone" });

            vi.mocked(GoogleDocsApi.createDocument).mockResolvedValue("doc-gone");
            vi.mocked(exportManuscript).mockResolvedValue("content");
            vi.mocked(GoogleDocsApi.replaceContent).mockRejectedValue(
                Object.assign(new Error("not found"), { code: 404 })
            );

            await expect(
                GoogleDocsExporter.exportToGoogleDocs(project.id, "STORY_READER")
            ).rejects.toThrow("Google Doc not found");
        });

        it("reuses existing doc mapping on second export", async () => {
            const project = await ProjectsController.createProject({ title: "Reuse" });

            vi.mocked(GoogleDocsApi.createDocument).mockResolvedValue("doc-reuse");
            vi.mocked(GoogleDocsApi.replaceContent).mockResolvedValue(undefined);
            vi.mocked(exportManuscript).mockResolvedValue("content");

            // First export creates the doc
            await GoogleDocsExporter.exportToGoogleDocs(project.id, "STORY_READER");

            // Second export should reuse the same doc
            vi.mocked(GoogleDocsApi.createDocument).mockClear();
            await GoogleDocsExporter.exportToGoogleDocs(project.id, "STORY_READER");

            // createDocument should NOT have been called again
            expect(GoogleDocsApi.createDocument).not.toHaveBeenCalled();
        });
    });
});
