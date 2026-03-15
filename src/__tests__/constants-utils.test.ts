import { describe, it, expect } from "vitest";
import {
    SCENE_STATUS_COLORS,
    SCENE_STATUS_DOT_COLORS,
    STORY_OBJECT_ICONS,
    PROJECT_TYPE_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type {
    ProjectType,
    SceneBlock,
    SceneStatus,
    StoryObjectType,
    StructureNodeType,
} from "@/lib/types";

describe("constants", () => {
    it("defines SCENE_STATUS_COLORS for all statuses", () => {
        const statuses: SceneStatus[] = ["OUTLINE", "DRAFT", "REVISED", "FINAL"];
        for (const status of statuses) {
            expect(SCENE_STATUS_COLORS[status]).toBeDefined();
            expect(typeof SCENE_STATUS_COLORS[status]).toBe("string");
        }
    });

    it("defines SCENE_STATUS_DOT_COLORS for all statuses", () => {
        expect(SCENE_STATUS_DOT_COLORS.OUTLINE).toBe("status-outline");
        expect(SCENE_STATUS_DOT_COLORS.DRAFT).toBe("status-draft");
        expect(SCENE_STATUS_DOT_COLORS.REVISED).toBe("status-revised");
        expect(SCENE_STATUS_DOT_COLORS.FINAL).toBe("status-final");
    });

    it("defines STORY_OBJECT_ICONS for all types", () => {
        const types: StoryObjectType[] = ["CHARACTER", "LOCATION", "PLOTLINE", "WORLD_ELEMENT", "NOTE"];
        for (const type of types) {
            expect(STORY_OBJECT_ICONS[type]).toBeDefined();
        }
    });

    it("defines PROJECT_TYPE_LABELS for all project types", () => {
        const projectTypes: ProjectType[] = ["FICTION", "ARTICLE_COLLECTION", "GENERAL"];
        for (const pt of projectTypes) {
            expect(PROJECT_TYPE_LABELS[pt]).toBeDefined();
            expect(PROJECT_TYPE_LABELS[pt].PART).toBeDefined();
            expect(PROJECT_TYPE_LABELS[pt].CHAPTER).toBeDefined();
            expect(PROJECT_TYPE_LABELS[pt].SCENE).toBeDefined();
        }
    });
});

describe("cn utility", () => {
    it("merges class names", () => {
        const result = cn("foo", "bar");
        expect(result).toContain("foo");
        expect(result).toContain("bar");
    });

    it("handles conditional classes", () => {
        const result = cn("base", false && "hidden", "visible");
        expect(result).toContain("base");
        expect(result).toContain("visible");
        expect(result).not.toContain("hidden");
    });

    it("handles empty input", () => {
        const result = cn();
        expect(result).toBe("");
    });
});

describe("types", () => {
    it("type definitions are usable", () => {
        const block: SceneBlock = { type: "CONTENT", content: "hello" };
        expect(block.type).toBe("CONTENT");

        const nodeType: StructureNodeType = "SCENE";
        expect(nodeType).toBe("SCENE");
    });
});
