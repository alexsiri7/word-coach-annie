// Scene content previews are capped at 300 chars by getManuscriptContext, but titles
// and synopses are not, so a single oversized synopsis can reach this. It bounds the
// AI provider cost of one analysis request.
export const MAX_PROMPT_LENGTH = 200_000;
