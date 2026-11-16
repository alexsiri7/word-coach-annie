// Client-safe on purpose: the editor imports this, so it must not pull in Node `crypto`.

export const BEAT_COMMENT_OPEN = "<!-- beat:";
export const BEAT_COMMENT_CLOSE = "-->";

/** A fresh global regex per call (no shared lastIndex); group 1 is the raw text between `beat:` and `-->`. */
export function beatCommentRegex(): RegExp {
    return /<!-- beat:([\s\S]*?)-->/g;
}

/** The canonical stored form of a beat. */
export function beatComment(text: string): string {
    return `${BEAT_COMMENT_OPEN} ${text.trim()} ${BEAT_COMMENT_CLOSE}`;
}
