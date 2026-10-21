import { clearOfflineData, getPendingOps } from "./idb";
import { replayPendingOps } from "./sync-queue";

// Writers: src/app/settings/page.tsx and sentry.client.config.ts (Sentry replay
// consent), src/components/setup-wizard.tsx (DISMISSED_KEY). The next-themes
// `theme` key is a device preference and stays.
const APP_LOCAL_STORAGE_KEYS = ["consent:sentry_replay", "setup-wizard-dismissed"];

// The precache holds only build assets and the /offline fallback; deleting it
// breaks offline fallback until the service worker reinstalls.
const KEPT_CACHE_PREFIX = "workbox-precache";

/**
 * Remove this user's data from the browser: the offline IndexedDB stores
 * (including unsynced pendingOps), app-owned localStorage keys and the
 * service-worker runtime caches. Each step runs even if an earlier one fails.
 */
export async function clearClientData(): Promise<void> {
    try {
        await clearOfflineData();
    } catch (err) {
        console.warn("[logout] Failed to clear offline data", err);
    }

    try {
        for (const key of APP_LOCAL_STORAGE_KEYS) localStorage.removeItem(key);
    } catch (err) {
        console.warn("[logout] Failed to clear localStorage", err);
    }

    try {
        if (typeof caches !== "undefined") {
            const names = (await caches.keys()).filter((name) => !name.startsWith(KEPT_CACHE_PREFIX));
            await Promise.all(names.map((name) => caches.delete(name)));
        }
    } catch (err) {
        console.warn("[logout] Failed to clear service-worker caches", err);
    }
}

/**
 * Flush the offline queue when online, then count what is still queued
 * (pending, conflict or finally-failed) and would be lost by clearClientData.
 */
export async function countUnsyncedOps(): Promise<number> {
    try {
        if (navigator.onLine) await replayPendingOps();
        return (await getPendingOps()).length;
    } catch {
        // An unreadable IndexedDB holds no queue to lose.
        return 0;
    }
}
