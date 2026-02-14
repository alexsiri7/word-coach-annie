import {
    createSnapshot,
    listSnapshots as listSnapshotsImpl,
    restoreSnapshot as restoreSnapshotImpl,
} from "../snapshot";

export async function snapshotDatabase(message: string) {
    if (!message || message.trim().length === 0) {
        throw new Error("A description message is required for the snapshot");
    }

    const result = createSnapshot(message.trim());
    return {
        success: true,
        hash: result.hash,
        message: result.message,
    };
}

export async function listDatabaseSnapshots(limit: number = 20) {
    const snapshots = listSnapshotsImpl(limit);
    return {
        snapshots,
        total: snapshots.length,
    };
}

export async function restoreDatabaseSnapshot(commitHash: string) {
    if (!commitHash || commitHash.trim().length === 0) {
        throw new Error("commitHash is required");
    }

    const result = restoreSnapshotImpl(commitHash.trim());
    return {
        success: true,
        hash: result.hash,
        message: result.message,
        warning:
            "The database has been restored. The Prisma client may need to reconnect — if you see errors, restart the MCP server.",
    };
}
