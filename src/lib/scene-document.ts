import type { SceneBlock } from "@/lib/types";
import { UserFacingError } from "@/lib/controllers/errors";
import { BEAT_COMMENT_CLOSE, BEAT_COMMENT_OPEN, beatComment, beatCommentRegex } from "@/lib/beat-comment";
import { computeContentHash } from "@/lib/content-hash";

/**
 * The scene document rules: a scene is a sequence of CONTENT and BEAT blocks,
 * and agents address it as a flat list of paragraphs. Every function here is
 * pure and returns new blocks rather than mutating its input.
 */

export type SceneParagraph = {
    index: number;
    blockIndex: number;
    positionWithinBlock: number;
    type: SceneBlock["type"];
    content: string;
};

// [\s\S]*? instead of .*? so <p> elements with embedded newlines are matched in full.
// Only use with match() — the /g flag makes lastIndex stateful, so exec() in a loop would fail across call sites.
const P_TAG_RE = /<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gi;

export function parseSceneContent(content: string): SceneBlock[] {
    const blocks: SceneBlock[] = [];
    const regex = beatCommentRegex();
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            blocks.push({ type: "CONTENT", content: content.substring(lastIndex, match.index) });
        }
        blocks.push({ type: "BEAT", content: match[1].trim() });
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
        blocks.push({ type: "CONTENT", content: content.substring(lastIndex) });
    }

    return blocks;
}

export function serializeSceneContent(blocks: SceneBlock[]): string {
    return blocks.map(block => block.type === "BEAT" ? beatComment(block.content) : block.content).join("");
}

/** Every beat comment must be closed, and may not contain another comment. */
export function validateSceneContent(content: string): void {
    const segments = content.split(BEAT_COMMENT_OPEN);
    for (let i = 1; i < segments.length; i++) {
        const segment = segments[i];
        const closeIndex = segment.indexOf(BEAT_COMMENT_CLOSE);
        if (closeIndex === -1) {
            throw new UserFacingError("Malformed scene content: Unclosed beat annotation found.");
        }
        if (segment.substring(0, closeIndex).includes("<!--")) {
            throw new UserFacingError("Malformed scene content: Nested comments in beats are not allowed.");
        }
    }
}

export function sceneContentHash(content: string): string {
    return computeContentHash(content);
}

export function paragraphHash(paragraph: Pick<SceneParagraph, "index" | "type" | "content">): string {
    return computeContentHash(String(paragraph.index), paragraph.type, paragraph.content);
}

export function flattenToParagraphs(blocks: SceneBlock[]): SceneParagraph[] {
    const result: SceneParagraph[] = [];
    let index = 0;
    for (const [blockIndex, block] of blocks.entries()) {
        const matches = block.type === "CONTENT" ? block.content.match(P_TAG_RE) : null;
        if (!matches?.length) {
            result.push({ index: index++, blockIndex, positionWithinBlock: 0, type: block.type, content: block.content });
        } else {
            for (const [positionWithinBlock, content] of matches.entries()) {
                result.push({ index: index++, blockIndex, positionWithinBlock, type: "CONTENT", content });
            }
        }
    }
    return result;
}

/**
 * Splits `blockContent` after the paragraph at the given 0-based position.
 * Returns [left, right] where left includes paragraphs 0..afterNthParagraph
 * and right contains the remainder. right is "" when splitting after the last paragraph.
 *
 * @param afterNthParagraph - 0-based index of the paragraph to split after
 */
function splitAtParagraph(blockContent: string, afterNthParagraph: number): [string, string] {
    let count = 0;
    const re = /<\/p>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(blockContent)) !== null) {
        count++;
        if (count === afterNthParagraph + 1) {
            const splitPos = match.index + match[0].length;
            return [blockContent.slice(0, splitPos), blockContent.slice(splitPos)];
        }
    }
    return [blockContent, ""];
}

function paragraphAt(blocks: SceneBlock[], index: number): SceneParagraph {
    const flat = flattenToParagraphs(blocks);
    if (index < 0 || index >= flat.length) {
        throw new UserFacingError(`Paragraph index ${index} out of range (0–${flat.length - 1})`);
    }
    return flat[index];
}

/** Replaces one paragraph, keeping the rest of its block (including inter-`<p>` whitespace) intact. */
export function replaceParagraph(blocks: SceneBlock[], index: number, content: string): SceneBlock[] {
    const entry = paragraphAt(blocks, index);
    const next = [...blocks];
    if (entry.type === "BEAT") {
        next[entry.blockIndex] = { type: "BEAT", content };
        return next;
    }
    const blockContent = blocks[entry.blockIndex].content;
    const matches = blockContent.match(P_TAG_RE);
    if (!matches || matches.length <= 1) {
        next[entry.blockIndex] = { type: "CONTENT", content };
    } else {
        const pos = entry.positionWithinBlock;
        const [before, rest] = pos === 0 ? ["", blockContent] : splitAtParagraph(blockContent, pos - 1);
        const [, after] = splitAtParagraph(rest, 0);
        next[entry.blockIndex] = { type: "CONTENT", content: before + content + after };
    }
    return next;
}

/** Removes the beat at `index`; prose paragraphs cannot be deleted this way. */
export function deleteBeatAt(blocks: SceneBlock[], index: number): SceneBlock[] {
    const entry = paragraphAt(blocks, index);
    if (entry.type !== "BEAT") {
        throw new UserFacingError(`Paragraph ${index} is prose, not a beat — delete_beat only removes beats`);
    }
    return blocks.filter((_, i) => i !== entry.blockIndex);
}

/**
 * Inserts a beat after paragraph `afterIndex` (-1 inserts at the very beginning),
 * splitting a CONTENT block at the `<p>` boundary when the paragraph is not its last.
 */
export function insertBeatAfter(blocks: SceneBlock[], afterIndex: number, text: string): SceneBlock[] {
    const flat = flattenToParagraphs(blocks);
    if (afterIndex < -1 || afterIndex >= flat.length) {
        throw new UserFacingError(`afterParagraphIndex ${afterIndex} out of range (-1–${flat.length - 1})`);
    }
    const beat: SceneBlock = { type: "BEAT", content: text };
    if (afterIndex === -1) return [beat, ...blocks];

    const entry = flat[afterIndex];
    const blockContent = blocks[entry.blockIndex].content;
    const matches = blockContent.match(P_TAG_RE);
    const isLastInBlock = entry.type === "BEAT" || !matches || entry.positionWithinBlock === matches.length - 1;
    const next = [...blocks];
    if (isLastInBlock) {
        next.splice(entry.blockIndex + 1, 0, beat);
    } else {
        const [left, right] = splitAtParagraph(blockContent, entry.positionWithinBlock);
        const replacement: SceneBlock[] = [{ type: "CONTENT", content: left }, beat];
        if (right.trim() !== "") replacement.push({ type: "CONTENT", content: right });
        next.splice(entry.blockIndex, 1, ...replacement);
    }
    return next;
}
