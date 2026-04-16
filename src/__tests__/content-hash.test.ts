import { describe, it, expect } from "vitest";
import {
  computeContentHash,
  verifyContentHash,
  StaleWriteError,
} from "@/mcp/content-hash";

describe("computeContentHash", () => {
  it("returns consistent hex string on repeated calls", () => {
    const hash1 = computeContentHash("a", "b");
    const hash2 = computeContentHash("a", "b");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns different hash for different input", () => {
    const hash1 = computeContentHash("a", "b");
    const hash2 = computeContentHash("a", "c");
    expect(hash1).not.toBe(hash2);
  });

  it("treats null, undefined, and empty string equivalently", () => {
    const hashNull = computeContentHash(null, undefined, "");
    const hashEmpty = computeContentHash("", "", "");
    expect(hashNull).toBe(hashEmpty);
  });
});

describe("verifyContentHash", () => {
  it("does not throw when hashes match", () => {
    const hash = computeContentHash("test");
    expect(() => verifyContentHash(hash, hash, "read_scene")).not.toThrow();
  });

  it("throws StaleWriteError when hashes differ", () => {
    expect(() => verifyContentHash("old", "new", "read_scene")).toThrow(
      StaleWriteError
    );
  });
});

describe("StaleWriteError", () => {
  it("has name StaleWriteError and includes the read tool in message", () => {
    const err = new StaleWriteError("read_scene");
    expect(err.name).toBe("StaleWriteError");
    expect(err.message).toContain("read_scene");
  });
});
