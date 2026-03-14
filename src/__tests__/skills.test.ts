import { describe, it, expect } from "vitest";
import { listSkills, loadSkill } from "../mcp/skills";

// The skills module reads from process.cwd()/.skills/
// Our tests run inside /app, so .skills/ at the project root will be used.
// Since the actual .skills/ folder exists with real skills, we test against those.

describe("MCP Skills", () => {
    describe("listSkills", () => {
        it("should return all available skills from .skills/ directory", () => {
            const skills = listSkills();

            expect(skills.length).toBeGreaterThanOrEqual(6);

            const names = skills.map(s => s.name);
            expect(names).toContain("developmental-edit");
            expect(names).toContain("line-edit");
            expect(names).toContain("consistency-check");
            expect(names).toContain("plot-structure-analysis");
            expect(names).toContain("character-arc-review");
            expect(names).toContain("scene-drafting-assistant");
        });

        it("should include metadata fields for each skill", () => {
            const skills = listSkills();
            const devEdit = skills.find(s => s.name === "developmental-edit");

            expect(devEdit).toBeDefined();
            expect(devEdit!.description).toContain("developmental edit");
            expect(devEdit!.required_tools).toContain("read_scene_content");
            expect(devEdit!.required_tools).toContain("get_outline");
            expect(devEdit!.triggers.length).toBeGreaterThan(0);
            expect(devEdit!.triggers).toContain("developmental edit");
        });

        it("should parse required_tools as an array", () => {
            const skills = listSkills();

            for (const skill of skills) {
                expect(Array.isArray(skill.required_tools)).toBe(true);
                expect(Array.isArray(skill.triggers)).toBe(true);
            }
        });
    });

    describe("loadSkill", () => {
        it("should load a skill by name with full instructions", () => {
            const skill = loadSkill("developmental-edit");

            expect(skill).not.toBeNull();
            expect(skill!.metadata.name).toBe("developmental-edit");
            expect(skill!.metadata.description).toContain("developmental edit");
            expect(skill!.instructions).toContain("# Developmental Edit");
            expect(skill!.instructions).toContain("## Steps");
            expect(skill!.instructions).toContain("## Output Format");
        });

        it("should load the line-edit skill", () => {
            const skill = loadSkill("line-edit");

            expect(skill).not.toBeNull();
            expect(skill!.metadata.name).toBe("line-edit");
            expect(skill!.instructions).toContain("# Line Edit");
            expect(skill!.metadata.required_tools).toContain("read_scene_content");
        });

        it("should load the consistency-check skill", () => {
            const skill = loadSkill("consistency-check");

            expect(skill).not.toBeNull();
            expect(skill!.metadata.name).toBe("consistency-check");
            expect(skill!.instructions).toContain("# Consistency Check");
            expect(skill!.metadata.required_tools).toContain("export_story_bible");
        });

        it("should load the plot-structure-analysis skill", () => {
            const skill = loadSkill("plot-structure-analysis");

            expect(skill).not.toBeNull();
            expect(skill!.metadata.name).toBe("plot-structure-analysis");
            expect(skill!.instructions).toContain("# Plot Structure Analysis");
            expect(skill!.metadata.required_tools).toContain("get_project_summary");
        });

        it("should load the character-arc-review skill", () => {
            const skill = loadSkill("character-arc-review");

            expect(skill).not.toBeNull();
            expect(skill!.metadata.name).toBe("character-arc-review");
            expect(skill!.instructions).toContain("# Character Arc Review");
        });

        it("should load the scene-drafting-assistant skill", () => {
            const skill = loadSkill("scene-drafting-assistant");

            expect(skill).not.toBeNull();
            expect(skill!.metadata.name).toBe("scene-drafting-assistant");
            expect(skill!.instructions).toContain("# Scene Drafting Assistant");
            expect(skill!.metadata.required_tools).toContain("write_scene_content");
        });

        it("should return null for a non-existent skill", () => {
            const skill = loadSkill("non-existent-skill");
            expect(skill).toBeNull();
        });

        it("should separate frontmatter from instructions body", () => {
            const skill = loadSkill("developmental-edit");

            expect(skill).not.toBeNull();
            // Instructions should NOT contain the frontmatter
            expect(skill!.instructions).not.toContain("required_tools:");
            expect(skill!.instructions).not.toContain("triggers:");
            // But metadata should have those parsed values
            expect(skill!.metadata.required_tools.length).toBeGreaterThan(0);
            expect(skill!.metadata.triggers.length).toBeGreaterThan(0);
        });
    });
});
