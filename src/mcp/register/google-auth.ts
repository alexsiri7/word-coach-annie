import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { toolError } from "@/mcp/tool-errors";
import { GoogleAuthController } from "@/lib/controllers/google-auth";
import {
    googleAuthStatusSpec,
    googleAuthConnectSpec,
    googleAuthCallbackSpec,
    googleAuthDisconnectSpec,
} from "@/lib/ai/tool-catalog/google-auth";
import { registerTool, type RegisterContext } from "./register-tool";

export function registerGoogleAuthTools(ctx: RegisterContext): void {
    const { userId } = ctx;

    registerTool(ctx, googleAuthStatusSpec, async () => {
        const status = await GoogleAuthController.getStatus(userId);
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    });

    registerTool(ctx, googleAuthConnectSpec, async () => {
        try {
            const url = GoogleAuthController.getAuthUrl(env.GOOGLE_REDIRECT_URI ?? '');
            return { content: [{ type: "text", text: `Please visit this URL to authorize: ${url}` }] };
        } catch (e) {
            logger.error("google_auth_connect: failed to generate auth URL", e);
            return toolError("Error generating auth URL", e);
        }
    });

    registerTool(ctx, googleAuthCallbackSpec, async ({ code }) => {
        try {
            await GoogleAuthController.handleCallback(code, env.GOOGLE_REDIRECT_URI ?? '', userId);
            return { content: [{ type: "text", text: "Successfully connected to Google!" }] };
        } catch (e) {
            logger.error("google_auth_callback: failed to complete OAuth flow", e);
            return toolError("Error connecting", e);
        }
    });

    registerTool(ctx, googleAuthDisconnectSpec, async () => {
        await GoogleAuthController.disconnect(userId);
        return { content: [{ type: "text", text: "Disconnected from Google." }] };
    });
}
