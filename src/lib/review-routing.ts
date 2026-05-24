/**
 * Maps scene status to the appropriate review skill name.
 * This is the single source of truth used by both the MCP server (mcp/index.ts)
 * and the HTTP API route (app/api/chat/route.ts).
 */
export const REVIEW_SKILL_BY_STATUS: Record<string, string> = {
  OUTLINE: "outline-review",
  DRAFT: "developmental-edit",
  REVISED: "line-edit",
  FINAL: "consistency-check",
};
