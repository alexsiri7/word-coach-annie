/**
 * The AI tool catalog: every tool's name, description, parameter schema and
 * destructive flag, defined once. The MCP server (src/mcp/register/) and the
 * in-app chat (src/lib/ai/adk-tools.ts) both register tools from these specs.
 */
import type { ToolCategory, ToolSpec } from "./types";
import * as coaching from "./coaching";
import * as exportTools from "./export";
import * as googleAuth from "./google-auth";
import * as locationImages from "./location-images";
import * as locationMaps from "./location-maps";
import * as locationSnapshots from "./location-snapshots";
import * as opportunities from "./opportunities";
import * as peerReview from "./peer-review";
import * as projects from "./projects";
import * as relationships from "./relationships";
import * as skills from "./skills";
import * as storyObjects from "./story-objects";
import * as structure from "./structure";
import * as submissions from "./submissions";
import * as universes from "./universes";
import * as writingTasks from "./writing-tasks";

export type { ToolCategory, ToolSpec } from "./types";

export const TOOL_SPECS: readonly ToolSpec[] = [
    projects, structure, storyObjects, relationships, locationImages, locationMaps, locationSnapshots,
    writingTasks, submissions, opportunities, exportTools, universes, googleAuth, coaching, skills, peerReview,
].flatMap((module): ToolSpec[] => Object.values(module));

export type ChatToolSpec = ToolSpec & { category: ToolCategory };

/** The specs offered to the in-app chat, in catalog order. */
export const CHAT_TOOL_SPECS: readonly ChatToolSpec[] = TOOL_SPECS.filter(
    (spec): spec is ChatToolSpec => spec.category !== undefined,
);
