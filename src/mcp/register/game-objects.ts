import { mcpRun } from "@/mcp/tool-errors";
import { GameObjectsController } from "@/lib/controllers/game-objects";
import { assertProjectOwner as verifyProjectOwnership } from "@/lib/ownership";
import {
    listGameObjectsSpec,
    getGameObjectSpec,
    saveGameObjectSpec,
    deleteGameObjectSpec,
} from "@/lib/ai/tool-catalog/game-objects";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerGameObjectTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, listGameObjectsSpec, async ({ projectId, kind }) =>
        mcpRun("list_game_objects", "Error listing game objects", async () => {
            await verifyProjectOwnership(projectId, userId);
            return { objects: await GameObjectsController.list(projectId, kind) };
        }));

    registerTool(ctx, getGameObjectSpec, async ({ projectId, kind, id }) =>
        mcpRun("get_game_object", "Error reading game object", async () => {
            await verifyProjectOwnership(projectId, userId);
            return GameObjectsController.get(projectId, kind, id);
        }));

    registerTool(ctx, saveGameObjectSpec, async ({ projectId, kind, object }) =>
        mcpRun("save_game_object", "Error saving game object", async () => {
            await verifyProjectOwnership(projectId, userId);
            return GameObjectsController.save(projectId, kind, object);
        }));

    registerTool(ctx, deleteGameObjectSpec, async ({ projectId, kind, id, confirm }) =>
        mcpRun("delete_game_object", "Error deleting game object", async () => {
            await verifyProjectOwnership(projectId, userId);
            return GameObjectsController.delete(projectId, kind, id, confirm);
        }));
}
