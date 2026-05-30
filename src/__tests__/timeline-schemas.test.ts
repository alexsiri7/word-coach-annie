import { describe, it, expect } from "vitest";
import { TimelineEntryCreateSchema, TimelineEntryUpdateSchema } from "@/schemas/timeline";

describe("TimelineEntryCreateSchema", () => {
  it("accepts valid minimal input", () => {
    expect(TimelineEntryCreateSchema.safeParse({ label: "Event" }).success).toBe(true);
  });

  it("accepts all optional fields", () => {
    const result = TimelineEntryCreateSchema.safeParse({
      label: "Event",
      description: "desc",
      attributes: "{}",
      orderIndex: 0,
      projectId: "proj-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing label", () => {
    const result = TimelineEntryCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    // In Zod v4, missing required field reports a type error
    expect(result.error?.issues[0].message).toBeTruthy();
  });

  it("rejects empty label", () => {
    const result = TimelineEntryCreateSchema.safeParse({ label: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("label is required");
  });

  it("rejects float orderIndex", () => {
    expect(TimelineEntryCreateSchema.safeParse({ label: "E", orderIndex: 1.5 }).success).toBe(false);
  });

  it("strips unknown fields (does not pass id or worldObjectId through)", () => {
    const result = TimelineEntryCreateSchema.safeParse({ label: "E", id: "injected" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("id");
    }
  });
});

describe("TimelineEntryUpdateSchema", () => {
  it("rejects completely empty object", () => {
    const result = TimelineEntryUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("No fields to update");
  });

  it("accepts partial update with only description", () => {
    expect(TimelineEntryUpdateSchema.safeParse({ description: "new" }).success).toBe(true);
  });

  it("accepts partial update with only label", () => {
    expect(TimelineEntryUpdateSchema.safeParse({ label: "new label" }).success).toBe(true);
  });

  it("rejects label as empty string", () => {
    expect(TimelineEntryUpdateSchema.safeParse({ label: "" }).success).toBe(false);
  });

  it("rejects float orderIndex", () => {
    expect(TimelineEntryUpdateSchema.safeParse({ orderIndex: 2.7 }).success).toBe(false);
  });

  it("strips unknown fields (does not pass id or createdAt through)", () => {
    const result = TimelineEntryUpdateSchema.safeParse({ label: "ok", id: "injected", createdAt: "2020" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("id");
      expect(result.data).not.toHaveProperty("createdAt");
    }
  });
});
