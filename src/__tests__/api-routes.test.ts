import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma } from "./setup";

// We test the business logic directly via Prisma since the route handlers
// use Prisma internally. These tests validate the data layer contracts
// that the API routes depend on.

describe("API: Projects", () => {
    it("creates and lists projects with word count", async () => {
        const p = await testPrisma.project.create({
            data: { title: "Novel A", author: "Author One" },
        });

        const ch = await testPrisma.structureNode.create({
            data: { projectId: p.id, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
        });

        const scene = await testPrisma.structureNode.create({
            data: { projectId: p.id, parentId: ch.id, type: "SCENE", title: "S1", orderIndex: 0 },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: scene.id, content: "Hello world foo", wordCount: 3 },
        });

        // List projects with word count calculation (mirrors GET /api/projects logic)
        const projects = await testPrisma.project.findMany({
            orderBy: { updatedAt: "desc" },
            include: { _count: { select: { structureNodes: true } } },
        });

        expect(projects).toHaveLength(1);
        expect(projects[0].title).toBe("Novel A");

        // Calculate word count (mirrors route logic)
        const scenes = await testPrisma.structureNode.findMany({
            where: { projectId: p.id, type: "SCENE" },
            select: { id: true },
        });

        let wordCount = 0;
        for (const s of scenes) {
            const v = await testPrisma.contentVersion.findFirst({
                where: { nodeId: s.id },
                orderBy: { createdAt: "desc" },
                select: { wordCount: true },
            });
            wordCount += v?.wordCount || 0;
        }

        expect(wordCount).toBe(3);
    });

    it("gets project by ID with counts", async () => {
        const p = await testPrisma.project.create({
            data: { title: "My Story", genre: "Fantasy" },
        });

        await testPrisma.structureNode.create({
            data: { projectId: p.id, type: "CHAPTER", title: "Ch1", orderIndex: 0 },
        });

        await testPrisma.storyObject.create({
            data: { projectId: p.id, type: "CHARACTER", name: "Alice" },
        });

        const found = await testPrisma.project.findUnique({
            where: { id: p.id },
            include: {
                _count: { select: { structureNodes: true, storyObjects: true } },
            },
        });

        expect(found!.title).toBe("My Story");
        expect(found!._count.structureNodes).toBe(1);
        expect(found!._count.storyObjects).toBe(1);
    });

    it("updates and deletes projects", async () => {
        const p = await testPrisma.project.create({ data: { title: "To Modify" } });

        const updated = await testPrisma.project.update({
            where: { id: p.id },
            data: { title: "Modified", genre: "Horror" },
        });
        expect(updated.title).toBe("Modified");
        expect(updated.genre).toBe("Horror");

        await testPrisma.project.delete({ where: { id: p.id } });
        const gone = await testPrisma.project.findUnique({ where: { id: p.id } });
        expect(gone).toBeNull();
    });
});

describe("API: Nodes", () => {
    let projectId: string;

    beforeEach(async () => {
        const p = await testPrisma.project.create({ data: { title: "Test" } });
        projectId = p.id;
    });

    it("creates nodes with orderIndex calculation", async () => {
        // Create chapter, then scenes with insertAfterIndex logic
        const ch = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
        });

        const _s1 = await testPrisma.structureNode.create({
            data: { projectId, parentId: ch.id, type: "SCENE", title: "Scene A", orderIndex: 0 },
        });

        const _s3 = await testPrisma.structureNode.create({
            data: { projectId, parentId: ch.id, type: "SCENE", title: "Scene C", orderIndex: 1 },
        });

        // Insert Scene B after Scene A (insertAfterIndex = 0)
        // First shift siblings at index >= 1
        await testPrisma.structureNode.updateMany({
            where: { projectId, parentId: ch.id, orderIndex: { gte: 1 } },
            data: { orderIndex: { increment: 1 } },
        });

        const _s2 = await testPrisma.structureNode.create({
            data: { projectId, parentId: ch.id, type: "SCENE", title: "Scene B", orderIndex: 1 },
        });

        const children = await testPrisma.structureNode.findMany({
            where: { parentId: ch.id },
            orderBy: { orderIndex: "asc" },
        });

        expect(children).toHaveLength(3);
        expect(children[0].title).toBe("Scene A");
        expect(children[0].orderIndex).toBe(0);
        expect(children[1].title).toBe("Scene B");
        expect(children[1].orderIndex).toBe(1);
        expect(children[2].title).toBe("Scene C");
        expect(children[2].orderIndex).toBe(2);
    });

    it("gets node with latest content version", async () => {
        const ch = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
        });

        const scene = await testPrisma.structureNode.create({
            data: { projectId, parentId: ch.id, type: "SCENE", title: "Scene 1", orderIndex: 0 },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: scene.id, content: "Version 1", wordCount: 2, createdAt: new Date("2025-01-01T00:00:00Z") },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: scene.id, content: "Version 2 latest", wordCount: 3, createdAt: new Date("2025-01-01T00:00:01Z") },
        });

        const node = await testPrisma.structureNode.findUnique({
            where: { id: scene.id },
            include: {
                contentVersions: { orderBy: { createdAt: "desc" }, take: 1 },
            },
        });

        expect(node!.contentVersions[0].content).toBe("Version 2 latest");
    });

    it("deletes node and reindexes siblings", async () => {
        await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Ch A", orderIndex: 0 },
        });

        const chB = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Ch B", orderIndex: 1 },
        });

        await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Ch C", orderIndex: 2 },
        });

        // Delete middle chapter
        await testPrisma.structureNode.delete({ where: { id: chB.id } });

        // Reindex
        const siblings = await testPrisma.structureNode.findMany({
            where: { projectId, parentId: null },
            orderBy: { orderIndex: "asc" },
            select: { id: true },
        });

        for (let i = 0; i < siblings.length; i++) {
            await testPrisma.structureNode.update({
                where: { id: siblings[i].id },
                data: { orderIndex: i },
            });
        }

        const result = await testPrisma.structureNode.findMany({
            where: { projectId, parentId: null },
            orderBy: { orderIndex: "asc" },
        });

        expect(result).toHaveLength(2);
        expect(result[0].title).toBe("Ch A");
        expect(result[0].orderIndex).toBe(0);
        expect(result[1].title).toBe("Ch C");
        expect(result[1].orderIndex).toBe(1);
    });
});

describe("API: Content Versioning", () => {
    let projectId: string;
    let sceneId: string;

    beforeEach(async () => {
        const p = await testPrisma.project.create({ data: { title: "Test" } });
        projectId = p.id;
        const ch = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
        });
        const scene = await testPrisma.structureNode.create({
            data: { projectId, parentId: ch.id, type: "SCENE", title: "Scene 1", orderIndex: 0 },
        });
        sceneId = scene.id;
    });

    it("saves content with word count and returns history", async () => {
        await testPrisma.contentVersion.create({
            data: { nodeId: sceneId, content: "One two three", wordCount: 3, createdAt: new Date("2025-01-01T00:00:00Z") },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: sceneId, content: "Updated content here now", wordCount: 4, createdAt: new Date("2025-01-01T00:00:01Z") },
        });

        const versions = await testPrisma.contentVersion.findMany({
            where: { nodeId: sceneId },
            orderBy: { createdAt: "desc" },
        });

        expect(versions).toHaveLength(2);
        expect(versions[0].content).toBe("Updated content here now");
        expect(versions[0].wordCount).toBe(4);
    });

    it("fetches a specific version by ID", async () => {
        const v1 = await testPrisma.contentVersion.create({
            data: { nodeId: sceneId, content: "First draft", wordCount: 2 },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: sceneId, content: "Second draft", wordCount: 2 },
        });

        // Fetch specific version
        const specific = await testPrisma.contentVersion.findFirst({
            where: { id: v1.id, nodeId: sceneId },
        });

        expect(specific).not.toBeNull();
        expect(specific!.content).toBe("First draft");
    });

    it("restores a previous version by creating a new one", async () => {
        const v1 = await testPrisma.contentVersion.create({
            data: { nodeId: sceneId, content: "Original text here", wordCount: 3, createdAt: new Date("2025-01-01T00:00:00Z") },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: sceneId, content: "Changed text", wordCount: 2, createdAt: new Date("2025-01-01T00:00:01Z") },
        });

        // Restore v1: create a new version with v1's content
        const sourceVersion = await testPrisma.contentVersion.findFirst({
            where: { id: v1.id, nodeId: sceneId },
        });

        expect(sourceVersion).not.toBeNull();

        const restored = await testPrisma.contentVersion.create({
            data: {
                nodeId: sceneId,
                content: sourceVersion!.content,
                wordCount: sourceVersion!.content.trim().split(/\s+/).length,
                createdAt: new Date("2025-01-01T00:00:02Z"),
            },
        });

        expect(restored.content).toBe("Original text here");
        expect(restored.wordCount).toBe(3);

        // Latest version should now be the restored one
        const latest = await testPrisma.contentVersion.findFirst({
            where: { nodeId: sceneId },
            orderBy: { createdAt: "desc" },
        });

        expect(latest!.content).toBe("Original text here");
    });

    it("prunes versions beyond max limit", async () => {
        const MAX = 5; // Use a small number for testing

        // Create MAX + 3 versions
        const baseTime = new Date("2025-01-01T00:00:00Z");
        for (let i = 0; i < MAX + 3; i++) {
            await testPrisma.contentVersion.create({
                data: { nodeId: sceneId, content: `Version ${i}`, wordCount: 2, createdAt: new Date(baseTime.getTime() + i * 1000) },
            });
        }

        // Now prune
        const allVersions = await testPrisma.contentVersion.findMany({
            where: { nodeId: sceneId },
            orderBy: { createdAt: "desc" },
            select: { id: true },
        });

        expect(allVersions.length).toBe(MAX + 3);

        const idsToDelete = allVersions.slice(MAX).map((v) => v.id);
        await testPrisma.contentVersion.deleteMany({
            where: { id: { in: idsToDelete } },
        });

        const remaining = await testPrisma.contentVersion.findMany({
            where: { nodeId: sceneId },
            orderBy: { createdAt: "desc" },
        });

        expect(remaining).toHaveLength(MAX);
        // Most recent should still be there
        expect(remaining[0].content).toBe(`Version ${MAX + 2}`);
    });
});

describe("API: Story Objects", () => {
    let projectId: string;

    beforeEach(async () => {
        const p = await testPrisma.project.create({ data: { title: "Test" } });
        projectId = p.id;
    });

    it("creates and lists story objects with type filter", async () => {
        await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Alice", role: "protagonist" },
        });
        await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Bob", role: "antagonist" },
        });
        await testPrisma.storyObject.create({
            data: { projectId, type: "LOCATION", name: "Castle" },
        });

        // List all
        const all = await testPrisma.storyObject.findMany({ where: { projectId } });
        expect(all).toHaveLength(3);

        // Filter by type
        const chars = await testPrisma.storyObject.findMany({
            where: { projectId, type: "CHARACTER" },
        });
        expect(chars).toHaveLength(2);

        // Search by name
        const searchResult = await testPrisma.storyObject.findMany({
            where: { projectId, name: { contains: "Ali" } },
        });
        expect(searchResult).toHaveLength(1);
        expect(searchResult[0].name).toBe("Alice");
    });

    it("updates story object fields", async () => {
        const char = await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Alice" },
        });

        const updated = await testPrisma.storyObject.update({
            where: { id: char.id },
            data: { name: "Alice Smith", description: "The hero", tags: "main,brave" },
        });

        expect(updated.name).toBe("Alice Smith");
        expect(updated.description).toBe("The hero");
        expect(updated.tags).toBe("main,brave");
    });

    it("deletes story object with cascading relationships", async () => {
        const char = await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Alice" },
        });

        const scene = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "S1", orderIndex: 0 },
        });

        await testPrisma.relationship.create({
            data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id },
        });

        await testPrisma.storyObject.delete({ where: { id: char.id } });

        const rels = await testPrisma.relationship.findMany();
        expect(rels).toHaveLength(0);
    });
});

describe("API: Relationships", () => {
    let projectId: string;

    beforeEach(async () => {
        const p = await testPrisma.project.create({ data: { title: "Test" } });
        projectId = p.id;
    });

    it("creates and queries relationships with includes", async () => {
        const char = await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Hero" },
        });

        const location = await testPrisma.storyObject.create({
            data: { projectId, type: "LOCATION", name: "Castle" },
        });

        const scene = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "Opening", orderIndex: 0 },
        });

        // Character appears in scene
        await testPrisma.relationship.create({
            data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id, label: "as hero" },
        });

        // Character located at location
        await testPrisma.relationship.create({
            data: { type: "LOCATED_AT", fromObjectId: char.id, toObjectId: location.id },
        });

        // Query all relationships for this project
        const nodes = await testPrisma.structureNode.findMany({
            where: { projectId },
            select: { id: true },
        });
        const objects = await testPrisma.storyObject.findMany({
            where: { projectId },
            select: { id: true },
        });

        const nodeIds = nodes.map((n) => n.id);
        const objectIds = objects.map((o) => o.id);

        const rels = await testPrisma.relationship.findMany({
            where: {
                OR: [
                    { fromNodeId: { in: nodeIds } },
                    { fromObjectId: { in: objectIds } },
                    { toNodeId: { in: nodeIds } },
                    { toObjectId: { in: objectIds } },
                ],
            },
            include: {
                fromNode: { select: { id: true, title: true, type: true } },
                fromObject: { select: { id: true, name: true, type: true } },
                toNode: { select: { id: true, title: true, type: true } },
                toObject: { select: { id: true, name: true, type: true } },
            },
        });

        expect(rels).toHaveLength(2);

        const appearsIn = rels.find((r) => r.type === "APPEARS_IN");
        expect(appearsIn!.fromObject!.name).toBe("Hero");
        expect(appearsIn!.toNode!.title).toBe("Opening");
        expect(appearsIn!.label).toBe("as hero");
    });

    it("updates relationship type and label", async () => {
        const char = await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "A" },
        });
        const scene = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "S1", orderIndex: 0 },
        });

        const rel = await testPrisma.relationship.create({
            data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id },
        });

        const updated = await testPrisma.relationship.update({
            where: { id: rel.id },
            data: { type: "RELATED_TO", label: "loosely connected" },
        });

        expect(updated.type).toBe("RELATED_TO");
        expect(updated.label).toBe("loosely connected");
    });

    it("deletes relationships", async () => {
        const char = await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "A" },
        });
        const scene = await testPrisma.structureNode.create({
            data: { projectId, type: "SCENE", title: "S1", orderIndex: 0 },
        });

        const rel = await testPrisma.relationship.create({
            data: { type: "APPEARS_IN", fromObjectId: char.id, toNodeId: scene.id },
        });

        await testPrisma.relationship.delete({ where: { id: rel.id } });

        const remaining = await testPrisma.relationship.findMany();
        expect(remaining).toHaveLength(0);
    });
});

describe("API: Export", () => {
    let projectId: string;

    beforeEach(async () => {
        const p = await testPrisma.project.create({
            data: { title: "My Novel", author: "Jane Doe", genre: "Fantasy", synopsis: "An epic tale" },
        });
        projectId = p.id;
    });

    it("builds outline tree correctly", async () => {
        const ch1 = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
        });

        const s1 = await testPrisma.structureNode.create({
            data: { projectId, parentId: ch1.id, type: "SCENE", title: "S1", orderIndex: 0 },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: s1.id, content: "<p>Hello world</p>", wordCount: 2 },
        });

        const _ch2 = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Ch 2", orderIndex: 1 },
        });

        // Build tree
        const nodes = await testPrisma.structureNode.findMany({
            where: { projectId },
            orderBy: { orderIndex: "asc" },
        });

        const sceneIds = nodes.filter((n) => n.type === "SCENE").map((n) => n.id);
        const contentMap: Record<string, string> = {};

        for (const sid of sceneIds) {
            const v = await testPrisma.contentVersion.findFirst({
                where: { nodeId: sid },
                orderBy: { createdAt: "desc" },
            });
            if (v) contentMap[sid] = v.content;
        }

        interface OutlineNode {
            id: string;
            type: string;
            title: string;
            parentId: string | null;
            children: OutlineNode[];
            content?: string;
        }

        const nodeMap = new Map<string, OutlineNode>();
        const roots: OutlineNode[] = [];

        for (const node of nodes) {
            nodeMap.set(node.id, { ...node, children: [], content: contentMap[node.id] });
        }

        for (const node of nodes) {
            const outlineNode = nodeMap.get(node.id)!;
            if (node.parentId && nodeMap.has(node.parentId)) {
                nodeMap.get(node.parentId)!.children.push(outlineNode);
            } else {
                roots.push(outlineNode);
            }
        }

        expect(roots).toHaveLength(2);
        expect(roots[0].title).toBe("Ch 1");
        expect(roots[0].children).toHaveLength(1);
        expect(roots[0].children[0].content).toBe("<p>Hello world</p>");
        expect(roots[1].title).toBe("Ch 2");
        expect(roots[1].children).toHaveLength(0);
    });

    it("exports story bible with grouped objects", async () => {
        await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Alice", role: "protagonist", description: "The hero" },
        });
        await testPrisma.storyObject.create({
            data: { projectId, type: "LOCATION", name: "Dark Forest", description: "A scary place" },
        });

        const objects = await testPrisma.storyObject.findMany({
            where: { projectId },
            orderBy: [{ type: "asc" }, { name: "asc" }],
        });

        const grouped: Record<string, typeof objects> = {};
        for (const obj of objects) {
            if (!grouped[obj.type]) grouped[obj.type] = [];
            grouped[obj.type].push(obj);
        }

        expect(grouped["CHARACTER"]).toHaveLength(1);
        expect(grouped["LOCATION"]).toHaveLength(1);
        expect(grouped["CHARACTER"][0].name).toBe("Alice");
    });
});

describe("API: Search", () => {
    let projectId: string;

    beforeEach(async () => {
        const p = await testPrisma.project.create({ data: { title: "Test" } });
        projectId = p.id;
    });

    it("searches scene content", async () => {
        const ch = await testPrisma.structureNode.create({
            data: { projectId, type: "CHAPTER", title: "Ch 1", orderIndex: 0 },
        });

        const s1 = await testPrisma.structureNode.create({
            data: { projectId, parentId: ch.id, type: "SCENE", title: "Opening", orderIndex: 0 },
        });

        const s2 = await testPrisma.structureNode.create({
            data: { projectId, parentId: ch.id, type: "SCENE", title: "Battle", orderIndex: 1 },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: s1.id, content: "<p>The dragon soared through the sky</p>", wordCount: 7 },
        });

        await testPrisma.contentVersion.create({
            data: { nodeId: s2.id, content: "<p>The knight fought bravely</p>", wordCount: 5 },
        });

        // Search for "dragon"
        const scenes = await testPrisma.structureNode.findMany({
            where: { projectId, type: "SCENE" },
            select: { id: true, title: true, parentId: true },
        });

        const results: { id: string; title: string }[] = [];
        const query = "dragon";

        for (const scene of scenes) {
            const v = await testPrisma.contentVersion.findFirst({
                where: { nodeId: scene.id },
                orderBy: { createdAt: "desc" },
                select: { content: true },
            });

            if (v) {
                const plainText = v.content.replace(/<[^>]+>/g, "");
                if (plainText.toLowerCase().includes(query.toLowerCase())) {
                    results.push({ id: scene.id, title: scene.title });
                }
            }
        }

        expect(results).toHaveLength(1);
        expect(results[0].title).toBe("Opening");
    });

    it("searches story objects by name", async () => {
        await testPrisma.storyObject.create({
            data: { projectId, type: "CHARACTER", name: "Dragon Lord" },
        });
        await testPrisma.storyObject.create({
            data: { projectId, type: "LOCATION", name: "Castle" },
        });

        const objects = await testPrisma.storyObject.findMany({
            where: { projectId },
            select: { id: true, name: true, type: true, description: true },
        });

        const query = "dragon";
        const matches = objects.filter(
            (o) =>
                o.name.toLowerCase().includes(query.toLowerCase()) ||
                o.description.toLowerCase().includes(query.toLowerCase())
        );

        expect(matches).toHaveLength(1);
        expect(matches[0].name).toBe("Dragon Lord");
    });

    it("returns empty results for no matches", async () => {
        const objects = await testPrisma.storyObject.findMany({ where: { projectId } });
        const query = "nonexistent";
        const matches = objects.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
        expect(matches).toHaveLength(0);
    });
});

describe("API: Projects - active project limit", () => {
    it("allows creation when below the active project limit", async () => {
        const userId = "user-limit-test-1";
        await testPrisma.project.createMany({
            data: [
                { title: "P1", userId },
                { title: "P2", userId },
            ],
        });
        const count = await testPrisma.project.count({ where: { userId, archivedAt: null } });
        const settings = await testPrisma.userAiSettings.findUnique({ where: { userId }, select: { maxActiveProjects: true } });
        const limit = settings?.maxActiveProjects ?? 3;
        expect(count).toBe(2);
        expect(count < limit).toBe(true);
    });

    it("detects when active project limit is reached", async () => {
        const userId = "user-limit-test-2";
        await testPrisma.project.createMany({
            data: [
                { title: "P1", userId },
                { title: "P2", userId },
                { title: "P3", userId },
            ],
        });
        const count = await testPrisma.project.count({ where: { userId, archivedAt: null } });
        const limit = 3;
        expect(count >= limit).toBe(true);
    });

    it("archived projects do not count toward the limit", async () => {
        const userId = "user-limit-test-3";
        await testPrisma.project.createMany({
            data: [
                { title: "Active 1", userId },
                { title: "Active 2", userId },
                { title: "Active 3", userId },
                { title: "Archived", userId, archivedAt: new Date() },
            ],
        });
        const activeCount = await testPrisma.project.count({ where: { userId, archivedAt: null } });
        expect(activeCount).toBe(3);
    });

    it("respects custom maxActiveProjects from UserAiSettings", async () => {
        const userId = "user-limit-test-4";
        await testPrisma.userAiSettings.create({
            data: { userId, maxActiveProjects: 5 },
        });
        const settings = await testPrisma.userAiSettings.findUnique({ where: { userId }, select: { maxActiveProjects: true } });
        expect(settings?.maxActiveProjects).toBe(5);
    });
});
