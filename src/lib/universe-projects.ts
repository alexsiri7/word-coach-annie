import type { Universe } from "@/lib/types";

/** Projects that can be offered for linking: those not already linked to `universe`. */
export function linkableProjects<P extends { id: string }>(
  projects: P[],
  universe: Pick<Universe, "projects">,
): P[] {
  const linkedIds = new Set(universe.projects?.map((linked) => linked.id));
  return projects.filter((p) => !linkedIds.has(p.id));
}
