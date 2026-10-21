import { DISMISSED_KEY } from "@/components/setup-wizard";
import { logger } from "@/lib/logger";
import { clearOfflineData, getPendingOps } from "./idb";
import { replayPendingOps } from "./sync-queue";

// "consent:sentry_replay" is written by src/app/settings/page.tsx and read by
// sentry.client.config.ts. The next-themes `theme` key is a device preference
// and stays.
const APP_LOCAL_STORAGE_KEYS = ["consent:sentry_replay", DISMISSED_KEY];

// The precache holds only build assets and the /offline fallback; deleting it
// breaks offline fallback until the service worker reinstalls.
const KEPT_CACHE_PREFIX = "workbox-precache";

/**
 * Remove this user's data from the browser: the offline IndexedDB stores
 * (including unsynced pendingOps), app-owned localStorage keys and the
 * service-worker runtime caches. Each step runs even if an earlier one fails;
 * failures are reported to Sentry because they leave the previous user's data
 * readable on this device.
 */
export async function clearClientData(): Promise<void> {
    try {
        await clearOfflineData();
    } catch (err) {
        logger.error("[logout] Failed to clear offline data", err);
    }

    try {
        for (const key of APP_LOCAL_STORAGE_KEYS) localStorage.removeItem(key);
    } catch (err) {
        logger.error("[logout] Failed to clear localStorage", err);
    }

    try {
        if (typeof caches !== "undefined") {
            const names = (await caches.keys()).filter((name) => !name.startsWith(KEPT_CACHE_PREFIX));
            await Promise.all(names.map((name) => caches.delete(name)));
        }
    } catch (err) {
        logger.error("[logout] Failed to clear service-worker caches", err);
    }
}

/**
 * Flush the offline queue when online, then count what is still queued
 * (pending, conflict or finally-failed) and would be lost by clearClientData.
 * Returns null when the queue cannot be read, so callers can't mistake an
 * unreadable queue for an empty one.
 */
export async function countUnsyncedOps(): Promise<number | null> {
    try {
        if (navigator.onLine) await replayPendingOps();
        return (await getPendingOps()).length;
    } catch {
        return null;
    }
}

/** An unreadable queue (null) counts as unsynced work: the user must be warned. */
export function hasUnsyncedWork(count: number | null): boolean {
    return count === null || count > 0;
}
