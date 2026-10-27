import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { $transaction: vi.fn() } }));

import { prisma } from "@/lib/db";
import { importProjectJson, ImportValidationError } from "@/lib/import-json";
import sampleData from "@/data/sherlock-sample.json";

type ExportData = Parameters<typeof importProjectJson>[0];

function exportWith(overrides: Partial<ExportData>): ExportData {
  return {
    exportVersion: 1,
    project: { title: "T", author: "A", synopsis: "", genre: "", projectType: "FICTION" },
    structureNodes: [],
    contentVersions: [],
    storyObjects: [],
    annotations: [],
    relationships: [],
    ...overrides,
  };
}

const node = (overrides: Partial<ExportData["structureNodes"][number]> = {}) => ({
  id: "n1", parentId: null, type: "SCENE", title: "", synopsis: "", status: "DRAFT", orderIndex: 0,
  ...overrides,
});

async function expectRejected(data: ExportData, message: string) {
  await expect(importProjectJson(data)).rejects.toThrow(ImportValidationError);
  await expect(importProjectJson(data)).rejects.toThrow(message);
  expect(prisma.$transaction).not.toHaveBeenCalled();
}

describe("importProjectJson input limits", () => {
  it.each([
    ["structureNodes", 5_000],
    ["contentVersions", 20_000],
    ["storyObjects", 5_000],
    ["annotations", 20_000],
    ["relationships", 20_000],
  ] as const)("rejects more than the maximum %s (%i) before opening the transaction", async (key, max) => {
    await expectRejected(exportWith({ [key]: new Array(max + 1).fill({}) }), `${key} exceeds the maximum of ${max}`);
  });

  it("rejects a collection that is not an array", async () => {
    await expectRejected(
      exportWith({ annotations: { length: 1 } as unknown as ExportData["annotations"] }),
      "annotations must be an array"
    );
  });

  it.each(["structureNodes", "contentVersions", "storyObjects", "annotations", "relationships"] as const)(
    "rejects %s entries that are not objects",
    async (key) => {
      for (const entry of [null, "x", []]) {
        await expectRejected(exportWith({ [key]: [entry] }), `${key} entries must be objects`);
      }
    }
  );

  it("rejects an unknown structure node type", async () => {
    await expectRejected(exportWith({ structureNodes: [node({ type: "BOOK" })] }), "Invalid structure node type");
  });

  it("rejects an unknown structure node status", async () => {
    await expectRejected(exportWith({ structureNodes: [node({ status: "PUBLISHED" })] }), "Invalid structure node status");
  });

  it("rejects a non-integer orderIndex", async () => {
    await expectRejected(exportWith({ structureNodes: [node({ orderIndex: 1.5 })] }), "Invalid structure node orderIndex");
    await expectRejected(
      exportWith({ structureNodes: [node({ orderIndex: "1" as unknown as number })] }),
      "Invalid structure node orderIndex"
    );
  });

  it("rejects an orderIndex outside the database integer range", async () => {
    await expectRejected(exportWith({ structureNodes: [node({ orderIndex: 2 ** 31 })] }), "Invalid structure node orderIndex");
    await expectRejected(exportWith({ structureNodes: [node({ orderIndex: -(2 ** 31) - 1 })] }), "Invalid structure node orderIndex");
  });

  it("rejects an unknown story object type", async () => {
    await expectRejected(
      exportWith({ storyObjects: [{ id: "o1", type: "VILLAIN", name: "", description: "", notes: "", role: null, tags: "" }] }),
      "Invalid story object type"
    );
  });

  it("rejects an unknown projectType", async () => {
    await expectRejected(
      exportWith({ project: { title: "T", author: "", synopsis: "", genre: "", projectType: "POETRY" } }),
      "Invalid projectType"
    );
  });

  it("accepts collections at their maximum and empty status/projectType defaults", async () => {
    await importProjectJson(exportWith({
      project: { title: "T", author: "", synopsis: "", genre: "", projectType: "" },
      structureNodes: [node({ status: "" }), node({ orderIndex: 2 ** 31 - 1 }), ...new Array(4_998).fill(node())],
      contentVersions: new Array(20_000).fill({}),
    }));
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("accepts the onboarding sample", async () => {
    await importProjectJson(sampleData, { isSample: true });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
