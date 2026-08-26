import type { Annotation } from "@/lib/types";

/**
 * Derive whether the current user is the project owner.
 * When userId is falsy (unauthenticated dev/API_TOKEN mode), treat as owner.
 */
export function deriveIsOwner(
  userId: string | null | undefined,
  ownerId: string
): boolean {
  return !userId || ownerId === userId;
}

/**
 * Prepend a newly-created annotation to the scene's annotation list,
 * returning a new Map to satisfy React immutability requirements.
 */
export function addAnnotationToMap(
  prev: Map<string, Annotation[]>,
  sceneId: string,
  annotation: Annotation
): Map<string, Annotation[]> {
  const next = new Map(prev);
  const existing = next.get(sceneId) ?? [];
  next.set(sceneId, [annotation, ...existing]);
  return next;
}
