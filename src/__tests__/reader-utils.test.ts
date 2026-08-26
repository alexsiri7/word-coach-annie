import { describe, it, expect } from "vitest";
import { deriveIsOwner, addAnnotationToMap } from "@/app/read/[id]/utils";
import type { Annotation } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnnotation(id: string): Annotation {
  return {
    id,
    nodeId: "node-1",
    content: "test content",
    range: "",
    selectedText: "some text",
    resolved: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// deriveIsOwner
// ---------------------------------------------------------------------------

describe("deriveIsOwner", () => {
  it("returns true when userId is null (unauthenticated / dev mode)", () => {
    expect(deriveIsOwner(null, "owner-abc")).toBe(true);
  });

  it("returns true when userId is undefined", () => {
    expect(deriveIsOwner(undefined, "owner-abc")).toBe(true);
  });

  it("returns true when userId matches ownerId", () => {
    expect(deriveIsOwner("owner-abc", "owner-abc")).toBe(true);
  });

  it("returns false when userId does not match ownerId", () => {
    expect(deriveIsOwner("reader-xyz", "owner-abc")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addAnnotationToMap
// ---------------------------------------------------------------------------

describe("addAnnotationToMap", () => {
  it("prepends annotation to an existing list for the scene", () => {
    const prev = new Map([["scene-1", [makeAnnotation("old")]]]);
    const result = addAnnotationToMap(prev, "scene-1", makeAnnotation("new"));
    expect(result.get("scene-1")![0].id).toBe("new");
    expect(result.get("scene-1")![1].id).toBe("old");
  });

  it("creates a new entry for scenes with no existing annotations", () => {
    const prev = new Map<string, Annotation[]>();
    const result = addAnnotationToMap(prev, "scene-2", makeAnnotation("first"));
    expect(result.get("scene-2")).toHaveLength(1);
    expect(result.get("scene-2")![0].id).toBe("first");
  });

  it("does not mutate the previous Map", () => {
    const prev = new Map([["scene-1", [makeAnnotation("old")]]]);
    addAnnotationToMap(prev, "scene-1", makeAnnotation("new"));
    expect(prev.get("scene-1")).toHaveLength(1); // original unchanged
  });

  it("does not mutate the previous annotation array", () => {
    const original = [makeAnnotation("old")];
    const prev = new Map([["scene-1", original]]);
    addAnnotationToMap(prev, "scene-1", makeAnnotation("new"));
    expect(original).toHaveLength(1); // original array unchanged
  });
});
