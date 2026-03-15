import { execFileSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

// Resolve the data directory (relative to src/mcp/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const DB_FILE = "word-coach-annie.db";

function git(...args: string[]): string {
    return execFileSync("git", args, {
        cwd: DATA_DIR,
        encoding: "utf-8",
        timeout: 10000,
    }).trim();
}

function isGitRepo(): boolean {
    try {
        git("rev-parse", "--is-inside-work-tree");
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
    // Docker volume mounts may have different ownership — mark data dir as safe
    try {
        execFileSync("git", ["config", "--global", "--add", "safe.directory", DATA_DIR], {
            encoding: "utf-8",
            timeout: 5000,
        });
    } catch {
        // Non-fatal — may already be configured
    }

    if (!isGitRepo()) {
        git("init");
        // Configure user for this repo
        git("config", "user.name", "Alex");
        git("config", "user.email", "alexsiri7@gmail.com");

        git("add", DB_FILE);
        git("commit", "-m", "initial: database snapshot repo initialized");
    } else {
        // Ensure user config exists even if repo already exists
        try {
            git("config", "user.name", "Alex");
            git("config", "user.email", "alexsiri7@gmail.com");
        } catch {
            // Ignore errors
        }
    }
}

/**
 * Create a snapshot (git commit) of the current database state.
 */
export function createSnapshot(message: string): { hash: string; message: string } {
    try {
        git("add", DB_FILE);
        // Check if there are changes to commit
        try {
            git("diff", "--cached", "--quiet");
            // No changes — commit with --allow-empty for the record
            git("commit", "--allow-empty", "-m", message);
        } catch {
            // There are staged changes, commit them
            git("commit", "-m", message);
        }
        const hash = git("rev-parse", "--short", "HEAD");
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
    const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit)) || 20, 1000));
    try {
        const log = git("log", "--oneline", `--format=%H|%aI|%s`, "-n", String(safeLimit));
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
    if (!/^[a-f0-9]{4,40}$/.test(commitHash)) {
        throw new Error(`Invalid commit hash: ${commitHash}`);
    }
    try {
        git("cat-file", "-t", commitHash);
        git("checkout", commitHash, "--", DB_FILE);

        const restoreMessage = `restore: reverted to snapshot ${commitHash}`;
        git("add", DB_FILE);
        git("commit", "-m", restoreMessage);

        const newHash = git("rev-parse", "--short", "HEAD");
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
        console.error("Warning: auto-snapshot failed for", operation);
    }
}
