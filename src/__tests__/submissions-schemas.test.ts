import { describe, it, expect } from "vitest";
import {
  ProviderCreateSchema,
  ProviderUpdateSchema,
  ContestSubmissionCreateSchema,
  ContestSubmissionUpdateSchema,
  PublicationSubmissionCreateSchema,
  PublicationSubmissionUpdateSchema,
  SubmissionStatus,
} from "@/schemas/submissions";

describe("SubmissionStatus", () => {
  it("accepts valid statuses", () => {
    for (const status of ["submitted", "accepted", "rejected", "withdrawn"]) {
      expect(SubmissionStatus.safeParse(status).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(SubmissionStatus.safeParse("pending").success).toBe(false);
    expect(SubmissionStatus.safeParse("").success).toBe(false);
  });
});

describe("ProviderCreateSchema", () => {
  it("accepts valid input", () => {
    const result = ProviderCreateSchema.safeParse({ name: "Clarkesworld" });
    expect(result.success).toBe(true);
  });

  it("accepts optional website and notes", () => {
    const result = ProviderCreateSchema.safeParse({
      name: "Clarkesworld",
      website: "https://clarkes.world",
      notes: "Sci-fi magazine",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(ProviderCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects missing name", () => {
    expect(ProviderCreateSchema.safeParse({}).success).toBe(false);
  });
});

describe("ProviderUpdateSchema", () => {
  it("accepts partial updates", () => {
    expect(ProviderUpdateSchema.safeParse({ name: "New Name" }).success).toBe(true);
    expect(ProviderUpdateSchema.safeParse({ website: "https://example.com" }).success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(ProviderUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("rejects empty name string", () => {
    expect(ProviderUpdateSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("ContestSubmissionCreateSchema", () => {
  const valid = {
    providerId: "prov-1",
    contestName: "Flash Fiction Contest",
    submissionDate: "2026-08-01T00:00:00Z",
  };

  it("accepts valid input", () => {
    expect(ContestSubmissionCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults status to submitted", () => {
    const result = ContestSubmissionCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("submitted");
  });

  it("accepts optional reviewDate", () => {
    const result = ContestSubmissionCreateSchema.safeParse({
      ...valid,
      reviewDate: "2026-09-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing contestName", () => {
    const { contestName: _, ...rest } = valid;
    expect(ContestSubmissionCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-ISO date", () => {
    expect(
      ContestSubmissionCreateSchema.safeParse({ ...valid, submissionDate: "August 1, 2026" }).success
    ).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(
      ContestSubmissionCreateSchema.safeParse({ ...valid, status: "pending" }).success
    ).toBe(false);
  });
});

describe("ContestSubmissionUpdateSchema", () => {
  it("accepts partial updates", () => {
    expect(ContestSubmissionUpdateSchema.safeParse({ contestName: "New Name" }).success).toBe(true);
    expect(ContestSubmissionUpdateSchema.safeParse({ status: "accepted" }).success).toBe(true);
  });

  it("accepts null reviewDate to clear it", () => {
    const result = ContestSubmissionUpdateSchema.safeParse({ reviewDate: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reviewDate).toBeNull();
  });

  it("accepts ISO reviewDate to set it", () => {
    const result = ContestSubmissionUpdateSchema.safeParse({ reviewDate: "2026-09-01T00:00:00Z" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(ContestSubmissionUpdateSchema.safeParse({}).success).toBe(true);
  });
});

describe("PublicationSubmissionCreateSchema", () => {
  const valid = {
    venueName: "The New Yorker",
    submissionDate: "2026-08-01T00:00:00Z",
  };

  it("accepts valid input", () => {
    expect(PublicationSubmissionCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults status to submitted", () => {
    const result = PublicationSubmissionCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBe("submitted");
  });

  it("rejects missing venueName", () => {
    expect(PublicationSubmissionCreateSchema.safeParse({ submissionDate: valid.submissionDate }).success).toBe(false);
  });
});

describe("PublicationSubmissionUpdateSchema", () => {
  it("accepts partial updates", () => {
    expect(PublicationSubmissionUpdateSchema.safeParse({ venueName: "Updated" }).success).toBe(true);
  });

  it("accepts empty object", () => {
    expect(PublicationSubmissionUpdateSchema.safeParse({}).success).toBe(true);
  });
});
