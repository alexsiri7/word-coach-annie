import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// Resolve the data directory (relative to mcp-server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_FILE = "word-coach-annie.db";

function git(args: string): string {
    return execSync(`git ${args}`, {
        cwd: DATA_DIR,
        encoding: "utf-8",
        timeout: 10000,
    }).trim();
}

function isGitRepo(): boolean {
    try {
        git("rev-parse --is-inside-work-tree");
        return true;
    } catch {
        return false;
    }
}

/**
 * Initialize git repo in data/ if it doesn't exist yet.
 * Called once on MCP server startup.
 */
export function initSnapshotRepo(): void {
    if (!isGitRepo()) {
        git("init");
        git(`add ${DB_FILE}`);
        git(`commit -m "initial: database snapshot repo initialized"`);
    }
}

/**
 * Create a snapshot (git commit) of the current database state.
 */
export function createSnapshot(message: string): { hash: string; message: string } {
    try {
        git(`add ${DB_FILE}`);
        // Check if there are changes to commit
        try {
            git("diff --cached --quiet");
            // No changes, but we still allow the snapshot with --allow-empty if the message is meaningful
            git(`commit --allow-empty -m "${message.replace(/"/g, '\\"')}"`);
        } catch {
            // There are changes, commit them
            git(`commit -m "${message.replace(/"/g, '\\"')}"`);
        }
        const hash = git("rev-parse --short HEAD");
        return { hash, message };
    } catch (error) {
        throw new Error(`Failed to create snapshot: ${error}`);
    }
}

/**
 * List recent snapshots.
 */
export function listSnapshots(limit: number = 20): Array<{
    hash: string;
    date: string;
    message: string;
}> {
    try {
        const log = git(`log --oneline --format="%H|%aI|%s" -n ${limit}`);
        if (!log) return [];
        return log.split("\n").map((line) => {
            const [hash, date, ...msgParts] = line.split("|");
            return {
                hash: hash.substring(0, 8),
                date,
                message: msgParts.join("|"),
            };
        });
    } catch {
        return [];
    }
}

/**
 * Restore the database to a previous snapshot.
 * Creates a new commit with the restored content.
 */
export function restoreSnapshot(commitHash: string): { hash: string; message: string } {
    try {
        // Verify the commit exists
        git(`cat-file -t ${commitHash}`);

        // Get the DB file content from that commit
        git(`checkout ${commitHash} -- ${DB_FILE}`);

        // Commit as a restore point
        const restoreMessage = `restore: reverted to snapshot ${commitHash}`;
        git(`add ${DB_FILE}`);
        git(`commit -m "${restoreMessage}"`);

        const newHash = git("rev-parse --short HEAD");
        return { hash: newHash, message: restoreMessage };
    } catch (error) {
        throw new Error(`Failed to restore snapshot '${commitHash}': ${error}`);
    }
}

/**
 * Auto-snapshot helper — call before destructive operations.
 */
export function autoSnapshot(operation: string, entityDescription: string): void {
    try {
        createSnapshot(`auto: before ${operation} "${entityDescription}"`);
    } catch {
        // Auto-snapshots should not block the operation
        console.error(`Warning: auto-snapshot failed for ${operation}`);
    }
}
