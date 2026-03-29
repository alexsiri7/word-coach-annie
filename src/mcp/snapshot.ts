/**
 * Database snapshot system.
 *
 * Previously used git-based versioning of the SQLite file. Now that the app
 * runs against Supabase PostgreSQL, file-level snapshots are not applicable.
 * Supabase provides its own point-in-time recovery (PITR) and daily backups.
 *
 * The functions below are kept as no-ops so callers (autoSnapshot in
 * controllers, MCP snapshot tools) don't need to be rewired.
 */

export function initSnapshotRepo(): void {
    // No-op: Supabase handles backups.
}

export function createSnapshot(message: string): { hash: string; message: string } {
    return { hash: "n/a", message: `[no-op] ${message} — snapshots disabled (using Supabase PITR)` };
}

export function listSnapshots(_limit: number = 20): Array<{
    hash: string;
    date: string;
    message: string;
}> {
    return [];
}

export function restoreSnapshot(_commitHash: string): { hash: string; message: string } {
    throw new Error(
        "Database snapshots are disabled. The app now uses Supabase PostgreSQL — " +
        "use Supabase Dashboard → Database → Backups for point-in-time recovery."
    );
}

export function autoSnapshot(_operation: string, _entityDescription: string): void {
    // No-op: Supabase handles backups.
}
