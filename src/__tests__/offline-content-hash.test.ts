import { describe, it, expect } from "vitest";
import { computeOfflineContentHash } from "@/lib/offline/content-hash";
import { computeContentHash } from "@/mcp/content-hash";

describe("computeOfflineContentHash", () => {
  it("returns a hex string", async () => {
    const hash = await computeOfflineContentHash("hello");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic (same input → same hash)", async () => {
    const a = await computeOfflineContentHash("test content");
    const b = await computeOfflineContentHash("test content");
    expect(a).toBe(b);
  });

  it("differs for different inputs", async () => {
    const a = await computeOfflineContentHash("<p>version 1</p>");
    const b = await computeOfflineContentHash("<p>version 2</p>");
    expect(a).not.toBe(b);
  });

  it("handles empty input without throwing", async () => {
    await expect(computeOfflineContentHash("")).resolves.toBeDefined();
  });

  it("produces the same digest as the server-side computeContentHash", async () => {
    const sample = "<p>Hello World</p>";
    const offlineHash = await computeOfflineContentHash(sample);
    const serverHash = computeContentHash(sample);
    expect(offlineHash).toBe(serverHash);
  });
});
