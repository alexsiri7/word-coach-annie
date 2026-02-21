import { prisma } from "./src/lib/db";
import { UniversesController } from "./src/lib/controllers/universes";
import { StoryObjectController } from "./src/lib/controllers/story-objects";

async function main() {
    try {
        console.log("Verifying selective transfer...");

        // 1. Setup
        const universe = await UniversesController.createUniverse({ title: "Transfer Universe" });
        const project = await prisma.project.create({ data: { title: "Source Project", universeId: universe.id } });
        const node = await prisma.structureNode.create({
            data: { projectId: project.id, type: "SCENE", title: "Scene 1", orderIndex: 0 }
        });

        const storyObj = await StoryObjectController.createStoryObject({
            projectId: project.id,
            type: "CHARACTER",
            name: "Transferred Character"
        });

        // Link character to scene
        await prisma.relationship.create({
            data: {
                type: "APPEARS_IN",
                fromObjectId: storyObj.id,
                toNodeId: node.id
            }
        });

        console.log("Setup complete. StoryObject ID:", storyObj.id);

        // 2. Transfer
        const result = await UniversesController.transferStoryObjectToUniverse(storyObj.id, universe.id);
        console.log("Transfer complete. WorldObject ID:", result.id);

        // 3. Verify
        const deleted = await prisma.storyObject.findUnique({ where: { id: storyObj.id } });
        if (deleted) throw new Error("StoryObject was not deleted");

        const wo = await prisma.worldObject.findUnique({ where: { id: result.id } });
        if (!wo) throw new Error("WorldObject was not created");

        const rels = await prisma.relationship.findMany({
            where: { fromWorldObjectId: result.id }
        });

        if (rels.length === 0) throw new Error("Relationship was not updated to point to WorldObject");
        console.log("Relationship correctly points to:", rels[0].fromWorldObjectId);

        console.log("Verification successful: Character moved and relationships updated.");
    } catch (error) {
        console.error("Verification failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
