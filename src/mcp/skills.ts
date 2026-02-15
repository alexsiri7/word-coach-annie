import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

const SKILLS_DIR = join(process.cwd(), ".skills");

export interface SkillMetadata {
    name: string;
    description: string;
    required_tools: string[];
    triggers: string[];
}

export interface Skill {
    metadata: SkillMetadata;
    instructions: string;
}

/**
 * Parse YAML-like frontmatter from a SKILL.md file.
 * Handles simple key-value pairs and arrays (indicated by "- item" lines).
 */
function parseFrontmatter(content: string): { metadata: Record<string, unknown>; body: string } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
        return { metadata: {}, body: content };
    }

    const [, frontmatterStr, body] = match;
    const metadata: Record<string, unknown> = {};
    let currentKey = "";

    for (const line of frontmatterStr.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Array item: "  - value"
        const arrayItemMatch = trimmed.match(/^-\s+(.+)$/);
        if (arrayItemMatch && currentKey) {
            const arr = metadata[currentKey];
            if (Array.isArray(arr)) {
                arr.push(arrayItemMatch[1].trim().replace(/^["']|["']$/g, ""));
            }
            continue;
        }

        // Key-value pair: "key: value"
        const kvMatch = trimmed.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
        if (kvMatch) {
            const [, key, value] = kvMatch;
            currentKey = key;
            if (value.trim() === "") {
                // Start of an array
                metadata[key] = [];
            } else {
                metadata[key] = value.trim().replace(/^["']|["']$/g, "");
            }
        }
    }

    return { metadata, body: body.trim() };
}

/**
 * List all available skills by scanning the .skills/ directory.
 * Returns metadata for each skill found.
 */
export function listSkills(): SkillMetadata[] {
    if (!existsSync(SKILLS_DIR)) {
        return [];
    }

    const entries = readdirSync(SKILLS_DIR);
    const skills: SkillMetadata[] = [];

    for (const entry of entries) {
        const skillDir = join(SKILLS_DIR, entry);
        const skillFile = join(skillDir, "SKILL.md");

        if (!statSync(skillDir).isDirectory()) continue;
        if (!existsSync(skillFile)) continue;

        try {
            const content = readFileSync(skillFile, "utf-8");
            const { metadata } = parseFrontmatter(content);

            skills.push({
                name: (metadata.name as string) || entry,
                description: (metadata.description as string) || "",
                required_tools: (metadata.required_tools as string[]) || [],
                triggers: (metadata.triggers as string[]) || [],
            });
        } catch (e) {
            console.error(`Warning: Could not load skill "${entry}":`, e);
        }
    }

    return skills;
}

/**
 * Load a specific skill by name.
 * Returns both the parsed metadata and the full instruction body.
 */
export function loadSkill(name: string): Skill | null {
    const skillFile = join(SKILLS_DIR, name, "SKILL.md");

    if (!existsSync(skillFile)) {
        return null;
    }

    try {
        const content = readFileSync(skillFile, "utf-8");
        const { metadata, body } = parseFrontmatter(content);

        return {
            metadata: {
                name: (metadata.name as string) || name,
                description: (metadata.description as string) || "",
                required_tools: (metadata.required_tools as string[]) || [],
                triggers: (metadata.triggers as string[]) || [],
            },
            instructions: body,
        };
    } catch (e) {
        console.error(`Error loading skill "${name}":`, e);
        return null;
    }
}
