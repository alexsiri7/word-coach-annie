import { describe, it, expect } from "vitest";
import {
  TimelineEntryCreateSchema,
  TimelineEntryUpdateSchema,
} from "@/schemas/timeline";

describe("TimelineEntryCreateSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = TimelineEntryCreateSchema.safeParse({
      label: "Age 20",
      description: "Young adult phase",
      attributes: "{}",
      orderIndex: 1,
      projectId: "proj-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal valid input (label only)", () => {
    const result = TimelineEntryCreateSchema.safeParse({ label: "Age 20" });
    expect(result.success).toBe(true);
  });

  it("requires label", () => {
    const result = TimelineEntryCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty label", () => {
    const result = TimelineEntryCreateSchema.safeParse({ label: "" });
    expect(result.success).toBe(false);
  });

  it("strips unknown fields (mass-assignment protection)", () => {
    const result = TimelineEntryCreateSchema.safeParse({
      label: "Age 20",
      id: "injected-id",
      worldObjectId: "injected-wo",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("id");
    expect(result.data).not.toHaveProperty("worldObjectId");
    expect(result.data).not.toHaveProperty("createdAt");
    expect(result.data).not.toHaveProperty("updatedAt");
  });

  it("rejects non-integer orderIndex", () => {
    const result = TimelineEntryCreateSchema.safeParse({
      label: "Age 20",
      orderIndex: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("TimelineEntryUpdateSchema", () => {
  it("accepts partial update with label", () => {
    const result = TimelineEntryUpdateSchema.safeParse({ label: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with description only", () => {
    const result = TimelineEntryUpdateSchema.safeParse({
      description: "New desc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty body (no fields to update)", () => {
    const result = TimelineEntryUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("No fields to update");
    }
  });

  it("strips unknown fields (mass-assignment protection)", () => {
    const result = TimelineEntryUpdateSchema.safeParse({
      label: "Updated",
      id: "injected-id",
      worldObjectId: "injected-wo",
      createdAt: "2024-01-01",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("id");
    expect(result.data).not.toHaveProperty("worldObjectId");
    expect(result.data).not.toHaveProperty("createdAt");
  });

  it("rejects non-integer orderIndex", () => {
    const result = TimelineEntryUpdateSchema.safeParse({ orderIndex: 2.5 });
    expect(result.success).toBe(false);
  });
});
