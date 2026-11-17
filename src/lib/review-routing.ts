const REVIEW_SKILL_BY_STATUS: Record<string, string> = {
  OUTLINE: "outline-review",
  DRAFT: "developmental-edit",
  REVISED: "line-edit",
  FINAL: "consistency-check",
};

/**
 * The review skill for a scene status; unknown statuses get the DRAFT skill.
 * Shared by the MCP `review` prompt and in-app chat.
 */
export function reviewSkillForStatus(status: string): string {
  return REVIEW_SKILL_BY_STATUS[status] ?? REVIEW_SKILL_BY_STATUS.DRAFT;
}
