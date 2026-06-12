import { describe, it, expect, vi } from "vitest";

// Mock Web Crypto for Node.js test environment
const mockDigest = vi.fn(async (_alg: string, data: BufferSource) => {
  // Deterministic mock: return length-based fake digest
  const len = (data as Uint8Array).length;
  return new Uint8Array(32).fill(len % 256).buffer;
});
vi.stubGlobal("crypto", { subtle: { digest: mockDigest } });

import { computeOfflineContentHash } from "@/lib/offline/content-hash";

describe("computeOfflineContentHash", () => {
  it("returns a hex string", async () => {
    const hash = await computeOfflineContentHash("hello");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic (same input → same hash)", async () => {
    const a = await computeOfflineContentHash("test content");
    const b = await computeOfflineContentHash("test content");
    expect(a).toBe(b);
  });

  it("differs for different inputs", async () => {
    mockDigest.mockImplementationOnce(async () => new Uint8Array(32).fill(10).buffer);
    mockDigest.mockImplementationOnce(async () => new Uint8Array(32).fill(20).buffer);
    const a = await computeOfflineContentHash("<p>version 1</p>");
    const b = await computeOfflineContentHash("<p>version 2</p>");
    expect(a).not.toBe(b);
  });

  it("handles empty input without throwing", async () => {
    await expect(computeOfflineContentHash("")).resolves.toBeDefined();
  });
});
