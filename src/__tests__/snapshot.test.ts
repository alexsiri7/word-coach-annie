import { describe, it, expect } from "vitest";
import {
  initSnapshotRepo,
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  autoSnapshot,
} from "@/mcp/snapshot";

describe("snapshot (no-op Supabase mode)", () => {
  it("initSnapshotRepo is a no-op", () => {
    expect(() => initSnapshotRepo()).not.toThrow();
  });

  it("createSnapshot returns a no-op result", () => {
    const result = createSnapshot("test snapshot");
    expect(result.hash).toBe("n/a");
    expect(result.message).toContain("[no-op]");
    expect(result.message).toContain("test snapshot");
  });

  it("listSnapshots returns empty array", () => {
    const result = listSnapshots();
    expect(result).toEqual([]);
  });

  it("listSnapshots accepts limit parameter", () => {
    const result = listSnapshots(5);
    expect(result).toEqual([]);
  });

  it("restoreSnapshot throws with Supabase guidance", () => {
    expect(() => restoreSnapshot("abc123")).toThrow("snapshots are disabled");
  });

  it("autoSnapshot is a no-op", () => {
    expect(() => autoSnapshot("create", "test entity")).not.toThrow();
  });
});
