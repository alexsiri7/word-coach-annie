import { describe, it, expect, vi, beforeAll } from "vitest";

// Stub SubtleCrypto for Node.js test environment
// Uses a content-sensitive XOR fold so different inputs produce different hashes.
beforeAll(() => {
  const mockDigest = vi.fn(async (_algo: string, data: BufferSource) => {
    const bytes = new Uint8Array((data as ArrayBuffer));
    const result = new Uint8Array(32);
    bytes.forEach((b, i) => { result[i % 32] ^= b; });
    return result.buffer;
  });
  vi.stubGlobal("crypto", { subtle: { digest: mockDigest } });
});

import { computeContentHash } from "@/lib/offline/content-hash";

describe("computeContentHash", () => {
  it("returns a 64-char hex string", async () => {
    const hash = await computeContentHash("<p>Hello world</p>");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same hash for identical plain-text regardless of HTML tags", async () => {
    const hash1 = await computeContentHash("<p>Hello</p>");
    const hash2 = await computeContentHash("<div><p>Hello</p></div>");
    expect(hash1).toBe(hash2);
  });

  it("produces the same hash for empty content", async () => {
    const hash = await computeContentHash("");
    expect(hash).toHaveLength(64);
  });

  it("produces different hashes for different plain-text content", async () => {
    const hash1 = await computeContentHash("<p>Hello</p>");
    const hash2 = await computeContentHash("<p>World</p>");
    expect(hash1).not.toBe(hash2);
  });

  it("is deterministic — same input always yields same hash", async () => {
    const input = "<p>Determinism test</p>";
    const hash1 = await computeContentHash(input);
    const hash2 = await computeContentHash(input);
    expect(hash1).toBe(hash2);
  });
});
