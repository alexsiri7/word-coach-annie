import type { SceneStatus } from "@/lib/types";

// Status-aware review prompts for the "Review this" toolbar button.
// Note: PROMPTS_BY_STATUS in scene-aware-chat-panel.tsx maps statuses to quick-prompt
// button arrays (different shape and call-site purpose). A future follow-up should
// consolidate all status-aware prompt content into a shared lib/scene-prompts.ts module.
export const REVIEW_PROMPTS: Record<SceneStatus, string> = {
  OUTLINE:
    "Please review this scene outline. Focus on plot structure, story purpose, and what this scene needs to accomplish.",
  DRAFT:
    "Please give me developmental feedback on this draft. Focus on structure, pacing, character behaviour, and emotional landing.",
  REVISED:
    "Please give me a line-level review of this scene. Focus on rhythm, word choice, clarity, and voice.",
  FINAL:
    "Please do a continuity and consistency check on this scene against the rest of the story.",
};

export function buildReviewPrompt(
  status: SceneStatus,
  title: string | undefined
): string {
  const prompt = REVIEW_PROMPTS[status];
  return title ? `[Scene: ${title}] ${prompt}` : prompt;
}
