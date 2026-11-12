import type { PersonalTokenScope } from "@/lib/personal-tokens";

const READ_TOOLS = [
    "list_projects",
    "get_project",
    "get_outline",
    "read_scene_content",
    "get_scene_versions",
];

const WRITE_TOOLS = [
    ...READ_TOOLS,
    "write_scene_content",
    "update_paragraph",
    "insert_beat",
    "delete_beat",
    "restore_scene_version",
];

/** The MCP tools a personal API token may see and call, per scope: scenes only. */
export const TOKEN_SCOPE_TOOLS: Record<PersonalTokenScope, ReadonlySet<string>> = {
    read: new Set(READ_TOOLS),
    write: new Set(WRITE_TOOLS),
};
