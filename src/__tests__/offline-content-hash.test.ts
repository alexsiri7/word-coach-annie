import { describe, it, expect, vi, beforeAll } from "vitest";

// Stub SubtleCrypto for Node.js test environment
beforeAll(() => {
  const mockDigest = vi.fn(async (_algo: string, data: BufferSource) => {
    // Deterministic stub: return bytes based on input length
    const len = (data as Uint8Array).byteLength;
    return new Uint8Array(32).fill(len % 256).buffer;
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
});
