import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// ─── DB Schema ──────────────────────────────────────────────────────────────

export interface PendingOp {
    id?: number; // auto-incremented
    url: string;
    method: string;
    body: string | null;
    timestamp: number;
    status: "pending" | "in-flight" | "failed" | "conflict";
    retries: number;
    serverContent?: string | null;
}

export interface AnnieDBSchema extends DBSchema {
    projects: {
        key: string;
        value: {
            id: string;
            universeId?: string | null;
            title: string;
            author: string;
            synopsis: string;
            genre: string;
            projectType: string;
            wordCount?: number;
            nodeCount?: number;
            sceneCount?: number;
            characterCount?: number;
            isSample?: boolean;
            archivedAt?: string | null;
            createdAt: string;
            updatedAt: string;
        };
    };
    structureNodes: {
        key: string;
        value: {
            id: string;
            projectId: string;
            parentId: string | null;
            type: string;
            title: string;
            synopsis: string;
            status: string;
            orderIndex: number;
            wordCount?: number;
            createdAt: string;
            updatedAt: string;
        };
        indexes: { "by-projectId": string };
    };
    contentVersions: {
        key: string;
        value: {
            id: string;
            nodeId: string;
            content: string;
            wordCount: number;
            createdAt: string;
        };
        indexes: { "by-nodeId": string };
    };
    storyObjects: {
        key: string;
        value: {
            id: string;
            projectId: string;
            type: string;
            name: string;
            description: string;
            notes: string;
            role: string | null;
            tags: string;
            source?: "project" | "universe";
            createdAt: string;
            updatedAt: string;
        };
        indexes: { "by-projectId": string };
    };
    annotations: {
        key: string;
        value: {
            id: string;
            nodeId: string;
            content: string;
            range: string;
            selectedText?: string | null;
            resolved: boolean;
            createdAt: string;
            updatedAt: string;
        };
        indexes: { "by-nodeId": string };
    };
    pendingOps: {
        key: number;
        value: PendingOp;
        autoIncrement: true;
    };
}

// ─── DB Connection ──────────────────────────────────────────────────────────

const DB_NAME = "annie-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AnnieDBSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<AnnieDBSchema>> {
    if (!dbPromise) {
        dbPromise = openDB<AnnieDBSchema>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // Projects store
                if (!db.objectStoreNames.contains("projects")) {
                    db.createObjectStore("projects", { keyPath: "id" });
                }

                // Structure nodes with projectId index
                if (!db.objectStoreNames.contains("structureNodes")) {
                    const nodeStore = db.createObjectStore("structureNodes", { keyPath: "id" });
                    nodeStore.createIndex("by-projectId", "projectId");
                }

                // Content versions with nodeId index
                if (!db.objectStoreNames.contains("contentVersions")) {
                    const cvStore = db.createObjectStore("contentVersions", { keyPath: "id" });
                    cvStore.createIndex("by-nodeId", "nodeId");
                }

                // Story objects with projectId index
                if (!db.objectStoreNames.contains("storyObjects")) {
                    const soStore = db.createObjectStore("storyObjects", { keyPath: "id" });
                    soStore.createIndex("by-projectId", "projectId");
                }

                // Annotations with nodeId index
                if (!db.objectStoreNames.contains("annotations")) {
                    const annoStore = db.createObjectStore("annotations", { keyPath: "id" });
                    annoStore.createIndex("by-nodeId", "nodeId");
                }

                // Pending operations (auto-increment)
                if (!db.objectStoreNames.contains("pendingOps")) {
                    db.createObjectStore("pendingOps", {
                        keyPath: "id",
                        autoIncrement: true,
                    });
                }
            },
        });
    }
    return dbPromise;
}

// ─── Typed Helpers ──────────────────────────────────────────────────────────

type StoreName = "projects" | "structureNodes" | "contentVersions" | "storyObjects" | "annotations" | "pendingOps";

/** Get a single record by key. */
export async function idbGet<S extends StoreName>(
    store: S,
    key: AnnieDBSchema[S]["key"]
): Promise<AnnieDBSchema[S]["value"] | undefined> {
    const db = await getDB();
    return db.get(store, key);
}

/** Put (upsert) a record. */
export async function idbPut<S extends StoreName>(
    store: S,
    value: AnnieDBSchema[S]["value"]
): Promise<AnnieDBSchema[S]["key"]> {
    const db = await getDB();
    return db.put(store, value);
}

/** Delete a record by key. */
export async function idbDelete<S extends StoreName>(
    store: S,
    key: AnnieDBSchema[S]["key"]
): Promise<void> {
    const db = await getDB();
    return db.delete(store, key);
}

/** Get all records from a store. */
export async function idbGetAll<S extends StoreName>(
    store: S
): Promise<AnnieDBSchema[S]["value"][]> {
    const db = await getDB();
    return db.getAll(store);
}

/** Get all structure nodes for a project. */
export async function idbGetNodesByProject(projectId: string) {
    const db = await getDB();
    return db.getAllFromIndex("structureNodes", "by-projectId", projectId);
}

/** Get all content versions for a node. */
export async function idbGetContentByNode(nodeId: string) {
    const db = await getDB();
    return db.getAllFromIndex("contentVersions", "by-nodeId", nodeId);
}

/** Get all story objects for a project. */
export async function idbGetStoryObjectsByProject(projectId: string) {
    const db = await getDB();
    return db.getAllFromIndex("storyObjects", "by-projectId", projectId);
}

/** Get all annotations for a node. */
export async function idbGetAnnotationsByNode(nodeId: string) {
    const db = await getDB();
    return db.getAllFromIndex("annotations", "by-nodeId", nodeId);
}

/** Clear all records from a store. */
export async function idbClear<S extends StoreName>(store: S): Promise<void> {
    const db = await getDB();
    return db.clear(store);
}

// ─── Pending Ops Helpers ────────────────────────────────────────────────────

/** Queue a pending operation for later sync. */
export async function queuePendingOp(op: Omit<PendingOp, "id">): Promise<number> {
    const db = await getDB();
    return db.add("pendingOps", op as PendingOp);
}

/** Get all pending operations ordered by timestamp. */
export async function getPendingOps(): Promise<PendingOp[]> {
    const ops = await idbGetAll("pendingOps");
    return ops.sort((a, b) => a.timestamp - b.timestamp);
}

/** Update fields on a pending operation (status, retries, serverContent). */
export async function updatePendingOp(
    id: number,
    updates: Partial<Pick<PendingOp, "status" | "retries" | "serverContent">>
): Promise<void> {
    const db = await getDB();
    const op = await db.get("pendingOps", id);
    if (op) {
        await db.put("pendingOps", { ...op, ...updates });
    }
}

/** Remove a completed pending operation. */
export async function removePendingOp(id: number): Promise<void> {
    return idbDelete("pendingOps", id);
}

/** Get all pending operations with conflict status. */
export async function getConflictOps(): Promise<PendingOp[]> {
    return (await getPendingOps()).filter((op) => op.status === "conflict");
}

// ─── Cache Write/Read Helpers ──────────────────────────────────────────────

/** Upsert an array of projects into the projects store. */
export async function cacheProjects(
    projects: AnnieDBSchema["projects"]["value"][]
): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("projects", "readwrite");
    await Promise.all([...projects.map((p) => tx.store.put(p)), tx.done]);
}

/** Upsert an array of structure nodes (flat) into structureNodes store. */
export async function cacheStructureNodes(
    nodes: AnnieDBSchema["structureNodes"]["value"][]
): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("structureNodes", "readwrite");
    await Promise.all([...nodes.map((n) => tx.store.put(n)), tx.done]);
}

/** Upsert a single content version into contentVersions store. */
export async function cacheContentVersion(
    cv: AnnieDBSchema["contentVersions"]["value"]
): Promise<void> {
    const db = await getDB();
    await db.put("contentVersions", cv);
}

/** Upsert an array of story objects into storyObjects store. */
export async function cacheStoryObjects(
    objects: AnnieDBSchema["storyObjects"]["value"][]
): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("storyObjects", "readwrite");
    await Promise.all([...objects.map((o) => tx.store.put(o)), tx.done]);
}

/** Get the most-recently-created content version for a node, or undefined. */
export async function getLatestCachedContent(
    nodeId: string
): Promise<AnnieDBSchema["contentVersions"]["value"] | undefined> {
    const versions = await idbGetContentByNode(nodeId);
    if (!versions.length) return undefined;
    return versions.reduce((a, b) =>
        new Date(a.createdAt) > new Date(b.createdAt) ? a : b
    );
}
