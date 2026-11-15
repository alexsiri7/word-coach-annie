import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { env } from "@/lib/env";
import type { PersonalTokenScope } from "@/lib/personal-tokens";
import { TOKEN_SCOPE_TOOLS } from "./token-scopes";
import type { RegisterContext } from "./register/register-tool";
import { registerProjectTools } from "./register/projects";
import { registerStructureTools } from "./register/structure";
import { registerStoryObjectTools } from "./register/story-objects";
import { registerRelationshipTools } from "./register/relationships";
import { registerLocationTools } from "./register/locations";
import { registerWritingTaskTools } from "./register/writing-tasks";
import { registerSubmissionTools } from "./register/submissions";
import { registerOpportunityTools } from "./register/opportunities";
import { registerExportTools } from "./register/export";
import { registerGameObjectTools } from "./register/game-objects";
import { registerUniverseTools } from "./register/universes";
import { registerGoogleAuthTools } from "./register/google-auth";
import { registerCoachingTools } from "./register/coaching";
import { registerSkillTools } from "./register/skills";
import { registerPrompts } from "./register/prompts";

interface McpServerOptions {
    /** Allow destructive tools (delete, restore). Default: check MCP_ALLOW_DESTRUCTIVE env var. */
    allowDestructive?: boolean;
    /** Authenticated user ID, extracted from x-user-id header by the MCP route handler. */
    userId?: string | null;
    /**
     * Set when the caller authenticated with a personal API token (x-token-scope header).
     * Only the tools in that scope's allowlist are registered, and no prompts; absent means everything.
     */
    tokenScope?: PersonalTokenScope;
}

function createServer(options?: McpServerOptions): McpServer {
    const server = new McpServer({
        name: "word-coach-annie",
        version: "1.0.0",
    });
    const ctx: RegisterContext = {
        server,
        userId: options?.userId ?? null,
        allowDestructive: options?.allowDestructive ?? env.MCP_ALLOW_DESTRUCTIVE,
        allowedTools: options?.tokenScope ? TOKEN_SCOPE_TOOLS[options.tokenScope] : null,
    };

    registerProjectTools(ctx);
    registerStructureTools(ctx);
    registerStoryObjectTools(ctx);
    registerRelationshipTools(ctx);
    registerLocationTools(ctx);
    registerWritingTaskTools(ctx);
    registerSubmissionTools(ctx);
    registerOpportunityTools(ctx);
    registerExportTools(ctx);
    registerGameObjectTools(ctx);
    registerUniverseTools(ctx);
    registerGoogleAuthTools(ctx);
    registerCoachingTools(ctx);
    registerSkillTools(ctx);
    // A personal token's surface is its scope's scene tools only, so its server registers no prompts.
    if (!ctx.allowedTools) registerPrompts(server, ctx.userId);

    return server;
}

export { createServer };
