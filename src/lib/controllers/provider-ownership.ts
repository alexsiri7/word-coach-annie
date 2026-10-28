import { prisma, type DbClient } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/controllers/errors";

/**
 * A provider may only be cited by a user who owns it: references to it are
 * `onDelete: Restrict`, so citing someone else's provider would block them from
 * deleting it. A null `userId` is the single-user caller and is unscoped;
 * `callerId` also admits the acting user's own provider when they act on
 * another user's row (a project editor citing a provider they created).
 */
export async function requireOwnedProvider(
    providerId: string,
    userId: string | null,
    { client = prisma, callerId = null }: { client?: DbClient; callerId?: string | null } = {}
) {
    const provider = await client.provider.findUnique({
        where: { id: providerId },
        select: { id: true, userId: true },
    });
    if (!provider) throw new NotFoundError("Provider not found");
    if (!userId || provider.userId === userId) return;
    if (callerId && provider.userId === callerId) return;
    throw new ForbiddenError("Forbidden");
}
