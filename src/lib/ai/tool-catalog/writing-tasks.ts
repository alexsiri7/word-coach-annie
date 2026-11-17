import { z } from "zod";
import { WritingTaskCapacity, WritingTaskDueDate, WritingTaskKind } from "@/schemas/writing-tasks";
import { defineTool } from "./types";

export const listWritingTasksSpec = defineTool({
    name: "list_writing_tasks",
    description: "List writing tasks for a project, or — when projectId is omitted — the practice tasks that belong to no project. Filter by importance (Critical/High/Medium), size (Small/Medium/Large), energy (Introspective/Dramatic/Technical), kind (Draft/Revise/Read/Gather/Admin), capacity (Low/Medium/Full), due date, or completion status.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().optional().describe("The project ID. Omit to list practice tasks that belong to no project"),
        completed: z.boolean().optional().describe("Filter by completion status (default: shows all)"),
        importance: z.enum(["Critical", "High", "Medium"]).optional().describe("Filter by importance"),
        size: z.enum(["Small", "Medium", "Large"]).optional().describe("Filter by size"),
        energy: z.enum(["Introspective", "Dramatic", "Technical"]).optional().describe("Filter by energy type — key dimension for mood-matched task selection"),
        kind: WritingTaskKind.optional().describe("Filter by kind of work"),
        capacity: WritingTaskCapacity.optional().describe("Filter by the writer's state the task suits"),
        dueBefore: WritingTaskDueDate.optional().describe("ISO 8601 date or date-time — only tasks due on or before it"),
    }),
});

export const getTaskDashboardSpec = defineTool({
    name: "get_task_dashboard",
    description: "Get the writer's task dashboard across every project in one call: open tasks (including practice tasks with no project), upcoming deadlines (task due dates and open opportunity close dates, soonest first), a short 'suggested now' list ranked by importance, deadline and size, and tasks completed in the last 7 days. Capacity filters to tasks that fit the writer's state (Low shows only Low; Full shows everything).",
    destructive: false,
    parameters: z.object({
        capacity: WritingTaskCapacity.optional().describe("How much the writer has in them today — keeps tasks suited to this capacity or less"),
        kind: WritingTaskKind.optional().describe("Only tasks of this kind of work"),
        projectId: z.string().optional().describe("Only this project's tasks and the opportunities it is a candidate for"),
    }),
});

export const createWritingTaskSpec = defineTool({
    name: "create_writing_task",
    description: "Create a new writing task for a project (optionally linked to a scene), or a practice task that belongs to no project.",
    destructive: false,
    parameters: z.object({
        projectId: z.string().optional().describe("The project ID. Omit for a practice task not tied to any project"),
        sceneId: z.string().optional().describe("Optional scene/node ID to link the task to (requires projectId)"),
        name: z.string().describe("One-line task description"),
        whatIsNeeded: z.string().optional().describe("Two sentences max — enough context to remember the idea"),
        importance: z.enum(["Critical", "High", "Medium"]).optional().describe("Task importance (default: Medium)"),
        size: z.enum(["Small", "Medium", "Large"]).optional().describe("Estimated writing size (default: Medium)"),
        energy: z.enum(["Introspective", "Dramatic", "Technical"]).optional().describe("Energy type required (default: Technical)"),
        kind: WritingTaskKind.optional().describe("Kind of work (default: Draft)"),
        capacity: WritingTaskCapacity.optional().describe("The writer's state the task suits — distinct from energy (default: Full)"),
        dueDate: WritingTaskDueDate.optional().describe("Optional ISO 8601 due date or date-time"),
    }),
});

export const completeWritingTaskSpec = defineTool({
    name: "complete_writing_task",
    description: "Mark a writing task as completed.",
    destructive: false,
    parameters: z.object({
        taskId: z.string().describe("The writing task ID to mark complete"),
    }),
});

export const updateWritingTaskSpec = defineTool({
    name: "update_writing_task",
    description: "Update fields on an existing writing task. All fields are optional — only provided fields are changed.",
    destructive: false,
    parameters: z.object({
        taskId: z.string().describe("The writing task ID to update"),
        name: z.string().min(1).optional().describe("New one-line task description"),
        whatIsNeeded: z.string().optional().describe("Updated context — two sentences max"),
        importance: z.enum(["Critical", "High", "Medium"]).optional().describe("Updated importance"),
        size: z.enum(["Small", "Medium", "Large"]).optional().describe("Updated size estimate"),
        energy: z.enum(["Introspective", "Dramatic", "Technical"]).optional().describe("Updated energy type"),
        kind: WritingTaskKind.optional().describe("Updated kind of work"),
        capacity: WritingTaskCapacity.optional().describe("Updated writer state the task suits"),
        dueDate: WritingTaskDueDate.nullable().optional().describe("New ISO 8601 due date or date-time, or null to clear it"),
        completed: z.boolean().optional().describe("Mark task complete or incomplete"),
    }),
});
