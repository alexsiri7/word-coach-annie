import type { DbClient } from "@/lib/db";

/** Default for `UserAiSettings.maxActiveProjects`; matches the schema's @default(3). */
const DEFAULT_MAX_ACTIVE_PROJECTS = 3;

export class ActiveProjectLimitError extends Error {
  constructor(limit: number) {
    super(`You've reached your ${limit} active project limit. Archive a project to create a new one.`);
    this.name = "ActiveProjectLimitError";
  }
}

/**
 * Throws ActiveProjectLimitError when `userId` already owns `maxActiveProjects`
 * unarchived projects. Call it inside the transaction that creates the project,
 * run at Serializable isolation, so concurrent creates cannot both pass the count.
 * No userId (API_TOKEN/dev mode) means no limit.
 */
export async function assertActiveProjectLimit(
  tx: DbClient,
  userId: string | null | undefined
): Promise<void> {
  if (!userId) return;
  const [activeCount, settings] = await Promise.all([
    tx.project.count({ where: { userId, archivedAt: null } }),
    tx.userAiSettings.findUnique({ where: { userId }, select: { maxActiveProjects: true } }),
  ]);
  const limit = settings?.maxActiveProjects ?? DEFAULT_MAX_ACTIVE_PROJECTS;
  if (activeCount >= limit) throw new ActiveProjectLimitError(limit);
}
