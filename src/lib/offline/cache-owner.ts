import { OFFLINE_CACHE_OWNER_KEY } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { clearClientData } from "./clear-client-data";
import { clearOfflineData } from "./idb";

/** Cache owner for a legacy API_TOKEN session, which has no user. */
export const API_TOKEN_CACHE_OWNER = "api-token";

/**
 * Make this device's offline cache belong to `owner` before anything reads it.
 * A session can end without logout (expiry, a cleared cookie), so the next
 * sign-in may be someone else: their cache is wiped, including the previous
 * user's unsynced writes, which must never replay under the new session.
 * With no recorded owner (a fresh device, or a cache written before owners
 * were recorded) the read caches are cleared but queued writes are kept.
 * Never throws: a failed claim must not sign the user out. The owner is not
 * recorded when the clear fails, so the next sign-in check tries again.
 */
export async function claimOfflineCache(owner: string): Promise<void> {
    try {
        const previous = localStorage.getItem(OFFLINE_CACHE_OWNER_KEY);
        if (previous === owner) return;
        if (previous !== null) {
            logger.warn("[offline] Signed-in user changed; clearing the previous user's offline data");
            await clearClientData();
        } else {
            await clearOfflineData({ keepPendingOps: true });
        }
        localStorage.setItem(OFFLINE_CACHE_OWNER_KEY, owner);
    } catch (err) {
        logger.error("[offline] Failed to claim the offline cache", err);
    }
}
