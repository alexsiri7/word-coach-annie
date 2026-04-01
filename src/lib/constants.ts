// Shared constants used across the app
import type { ProjectType, SceneStatus, StoryObjectType } from "./types";

export const PLAN_LIMITS = {
    FREE: { maxProjects: 3 },
    PRO: { maxProjects: Infinity },
} as const;

export type SubscriptionTier = keyof typeof PLAN_LIMITS;

export const SCENE_STATUS_COLORS: Record<SceneStatus, string> = {
    OUTLINE: "bg-surface-overlay text-text-muted",
    DRAFT: "bg-warning/15 text-warning",
    REVISED: "bg-accent/15 text-accent",
    FINAL: "bg-success/15 text-success",
};

export const SCENE_STATUS_DOT_COLORS: Record<SceneStatus, string> = {
    OUTLINE: "status-outline",
    DRAFT: "status-draft",
    REVISED: "status-revised",
    FINAL: "status-final",
};

export const STORY_OBJECT_ICONS: Record<StoryObjectType, string> = {
    CHARACTER: "Users",
    LOCATION: "MapPin",
    PLOTLINE: "GitBranch",
    WORLD_ELEMENT: "Globe",
    NOTE: "StickyNote",
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, Record<string, string>> = {
    FICTION: {
        PART: "Part",
        CHAPTER: "Chapter",
        SCENE: "Scene",
        CHARACTER: "Character",
        LOCATION: "Location",
        PLOTLINE: "Plotline",
        WORLD_ELEMENT: "World Element",
        NOTE: "Note",
    },
    ARTICLE_COLLECTION: {
        PART: "Series",
        CHAPTER: "Article",
        SCENE: "Section",
        CHARACTER: "Persona",
        LOCATION: "—",
        PLOTLINE: "Thesis",
        WORLD_ELEMENT: "Key Concept",
        NOTE: "Research Note",
    },
    GENERAL: {
        PART: "Part",
        CHAPTER: "Chapter",
        SCENE: "Section",
        CHARACTER: "Character",
        LOCATION: "Location",
        PLOTLINE: "Thread",
        WORLD_ELEMENT: "Element",
        NOTE: "Note",
    },
};
