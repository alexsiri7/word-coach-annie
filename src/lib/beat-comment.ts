// Client-safe on purpose: the editor imports this, so it must not pull in Node `crypto`.

const COMMENT_OPEN = "<!--";
export const BEAT_COMMENT_OPEN = "<!-- beat:";
export const BEAT_COMMENT_CLOSE = "-->";

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
 */
export function findBeatComments(input: string): BeatCommentMatch[] {
    const matches: BeatCommentMatch[] = [];
    let searchFrom = 0;
    while (true) {
        const openIndex = input.indexOf(BEAT_COMMENT_OPEN, searchFrom);
        if (openIndex === -1) break;
        const contentStart = openIndex + BEAT_COMMENT_OPEN.length;
        const closeIndex = input.indexOf(BEAT_COMMENT_CLOSE, contentStart);
        if (closeIndex === -1) break;
        const end = closeIndex + BEAT_COMMENT_CLOSE.length;
        matches.push({ content: input.slice(contentStart, closeIndex), start: openIndex, end });
        searchFrom = end;
    }
    return matches;
}

/** The data of a beat comment node (between `<!--` and `-->`), for building one through the DOM. */
export function beatCommentData(content: string): string {
    return `${BEAT_COMMENT_OPEN.slice(COMMENT_OPEN.length)} ${content} `;
}

/** The canonical stored form of a beat. */
export function beatComment(text: string): string {
    return `${COMMENT_OPEN}${beatCommentData(text.trim())}${BEAT_COMMENT_CLOSE}`;
}
