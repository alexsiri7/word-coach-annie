import { describe, it, expect } from "vitest";
import {
  computeSubmissionSummary,
  type ContestSubmissionSummary,
  type PublicationSubmissionSummary,
} from "@/components/submission-activity-summary";

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

describe("computeSubmissionSummary", () => {
  it("returns activeCount=0 and nextReviewDate=null for empty arrays", () => {
    const result = computeSubmissionSummary([], []);
    expect(result).toEqual({ activeCount: 0, nextReviewDate: null });
  });

  it("counts only submitted-status entries across both arrays", () => {
    const contests: ContestSubmissionSummary[] = [
      { id: "c1", status: "submitted", reviewDate: null },
      { id: "c2", status: "accepted", reviewDate: null },
    ];
    const pubs: PublicationSubmissionSummary[] = [
      { id: "p1", status: "submitted" },
      { id: "p2", status: "rejected" },
    ];
    const { activeCount } = computeSubmissionSummary(contests, pubs);
    expect(activeCount).toBe(2);
  });

  it("does not count withdrawn or accepted submissions as active", () => {
    const contests: ContestSubmissionSummary[] = [
      { id: "c1", status: "accepted", reviewDate: null },
      { id: "c2", status: "withdrawn", reviewDate: null },
    ];
    const pubs: PublicationSubmissionSummary[] = [
      { id: "p1", status: "rejected" },
    ];
    const { activeCount } = computeSubmissionSummary(contests, pubs);
    expect(activeCount).toBe(0);
  });

  it("picks the earliest future reviewDate as nextReviewDate", () => {
    const d1 = new Date(Date.now() + 1 * 86_400_000).toISOString();
    const d2 = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const contests: ContestSubmissionSummary[] = [
      { id: "c1", status: "submitted", reviewDate: d2 },
      { id: "c2", status: "submitted", reviewDate: d1 },
    ];
    const { nextReviewDate } = computeSubmissionSummary(contests, []);
    expect(nextReviewDate).toBe(d1);
  });

  it("excludes past reviewDates from nextReviewDate", () => {
    const contests: ContestSubmissionSummary[] = [
      { id: "c1", status: "submitted", reviewDate: PAST },
    ];
    const { nextReviewDate } = computeSubmissionSummary(contests, []);
    expect(nextReviewDate).toBeNull();
  });

  it("excludes non-submitted contests from reviewDate candidates", () => {
    const contests: ContestSubmissionSummary[] = [
      { id: "c1", status: "accepted", reviewDate: FUTURE },
    ];
    const { nextReviewDate } = computeSubmissionSummary(contests, []);
    expect(nextReviewDate).toBeNull();
  });

  it("returns null nextReviewDate when no reviewDates are set", () => {
    const contests: ContestSubmissionSummary[] = [
      { id: "c1", status: "submitted", reviewDate: null },
    ];
    const { nextReviewDate } = computeSubmissionSummary(contests, []);
    expect(nextReviewDate).toBeNull();
  });

  it("counts publication submissions without reviewDate in activeCount", () => {
    const pubs: PublicationSubmissionSummary[] = [
      { id: "p1", status: "submitted" },
      { id: "p2", status: "submitted" },
    ];
    const { activeCount, nextReviewDate } = computeSubmissionSummary([], pubs);
    expect(activeCount).toBe(2);
    expect(nextReviewDate).toBeNull();
  });
});
