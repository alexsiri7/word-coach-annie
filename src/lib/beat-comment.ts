// Client-safe on purpose: the editor imports this, so it must not pull in Node `crypto`.

const COMMENT_OPEN = "<!--";
export const BEAT_COMMENT_OPEN = "<!-- beat:";
export const BEAT_COMMENT_CLOSE = "-->";
const BEAT_MARKER = "beat:";

export type BeatCommentMatch = {
    /** Raw text between `beat:` and `-->`, untrimmed. */
    content: string;
    /** Index of the opening `<!-- beat:` in the source string. */
    start: number;
    /** Index just past the closing `-->` in the source string. */
    end: number;
};

/**
 * Finds every `<!-- beat: ... -->` comment via a linear left-to-right scan.
 * A regex with a lazy wildcard between two literals (e.g. `[\s\S]*?`) re-scans
 * to the end of the string for every unterminated "<!-- beat:" occurrence,
 * which is O(n²) on adversarial input (flagged by CodeQL as a polynomial ReDoS);
 * this stays O(n).
 *
 * `lenient` also matches hand-typed variants (`<!--beat:`, `<!--  BEAT:`) that
 * the parser and editor leave as plain comments, for callers that must never
 * let beat text through to readers, exports or word counts.
 */
export function findBeatComments(input: string, { lenient = false } = {}): BeatCommentMatch[] {
    const matches: BeatCommentMatch[] = [];
    let searchFrom = 0;
    while (true) {
        const openIndex = input.indexOf(COMMENT_OPEN, searchFrom);
        if (openIndex === -1) break;
        const contentStart = lenient ? lenientBeatContentStart(input, openIndex) : strictBeatContentStart(input, openIndex);
        if (contentStart === -1) {
            searchFrom = openIndex + 1;
            continue;
        }
        const closeIndex = input.indexOf(BEAT_COMMENT_CLOSE, contentStart);
        if (closeIndex === -1) break;
        const end = closeIndex + BEAT_COMMENT_CLOSE.length;
        matches.push({ content: input.slice(contentStart, closeIndex), start: openIndex, end });
        searchFrom = end;
    }
    return matches;
}

function strictBeatContentStart(input: string, openIndex: number): number {
    return input.startsWith(BEAT_COMMENT_OPEN, openIndex) ? openIndex + BEAT_COMMENT_OPEN.length : -1;
}

function lenientBeatContentStart(input: string, openIndex: number): number {
    let i = openIndex + COMMENT_OPEN.length;
    while (i < input.length && /\s/.test(input[i])) i++;
    return input.slice(i, i + BEAT_MARKER.length).toLowerCase() === BEAT_MARKER ? i + BEAT_MARKER.length : -1;
}

/** Removes every beat comment, including the hand-typed variants `lenient` matches. */
export function stripBeatComments(html: string): string {
    let result = "";
    let copiedUpTo = 0;
    for (const match of findBeatComments(html, { lenient: true })) {
        result += html.slice(copiedUpTo, match.start);
        copiedUpTo = match.end;
    }
    return result + html.slice(copiedUpTo);
}

/** The data of a beat comment node (between `<!--` and `-->`), for building one through the DOM. */
export function beatCommentData(content: string): string {
    return `${BEAT_COMMENT_OPEN.slice(COMMENT_OPEN.length)} ${content} `;
}

/** The canonical stored form of a beat. */
export function beatComment(text: string): string {
    return `${COMMENT_OPEN}${beatCommentData(text.trim())}${BEAT_COMMENT_CLOSE}`;
}
