import { z } from "zod";
import { defineTool } from "./types";

export const googleAuthStatusSpec = defineTool({
    name: "google_auth_status",
    description: "Check if Google credentials are configured and valid",
    destructive: false,
    parameters: z.object({}),
});

export const googleAuthConnectSpec = defineTool({
    name: "google_auth_connect",
    description: "Initiate OAuth flow; returns auth URL for the user to visit",
    destructive: false,
    parameters: z.object({}),
});

export const googleAuthCallbackSpec = defineTool({
    name: "google_auth_callback",
    description: "Complete OAuth flow with the authorization code",
    destructive: false,
    parameters: z.object({
        code: z.string().describe("The authorization code from the redirect URL"),
    }),
});

export const googleAuthDisconnectSpec = defineTool({
    name: "google_auth_disconnect",
    description: "Revoke and delete stored Google credentials",
    destructive: true,
    parameters: z.object({}),
});
