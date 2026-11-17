import { z } from "zod";
import { defineTool } from "./types";

export const listSkillsSpec = defineTool({
    name: "list_skills",
    description: "List all available writing skills (structured instruction sets for writing tasks like developmental editing, line editing, etc).",
    destructive: false,
    category: "core",
    parameters: z.object({}),
});

export const getInitialInstructionsSpec = defineTool({
    name: "get_initial_instructions",
    description: "Returns static guidelines for how Claude should collaborate with Annie. Call this at the start of a session to establish the correct collaboration model: structural collaborator by default, beats and annotations over prose, correct tool usage.",
    destructive: false,
    parameters: z.object({}),
});
