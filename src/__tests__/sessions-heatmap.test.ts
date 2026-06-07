import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SessionsController } from "@/lib/controllers/sessions";
import { ProjectsController } from "@/lib/controllers/projects";

describe("SessionsController heatmap", () => {
  let projectId: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-02T12:00:00Z"));
    const project = await ProjectsController.createProject({ title: "Heatmap Test" });
    projectId = project.id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("always returns exactly N entries for N-day window", async () => {
    const heatmap = await SessionsController.getGlobalHeatmap(14);
    expect(heatmap).toHaveLength(14);
  });

  it("spans month boundary correctly", async () => {
    // Fake time is March 2 — a 7-day window should span Feb 24 to Mar 2
    const heatmap = await SessionsController.getGlobalHeatmap(7);
    expect(heatmap).toHaveLength(7);
    expect(heatmap[0].date).toBe("2024-02-25");
    expect(heatmap[6].date).toBe("2024-03-02");
  });

  it("excludes future-dated sessions from heatmap", async () => {
    await SessionsController.createSession({
      projectId,
      wordsWritten: 500,
      date: "2024-03-05", // 3 days in the future
    });

    const heatmap = await SessionsController.getGlobalHeatmap(7);
    const futurEntry = heatmap.find((d) => d.date === "2024-03-05");
    expect(futurEntry).toBeUndefined();
    expect(heatmap.every((d) => d.wordsWritten === 0)).toBe(true);
  });

  it("project-scoped heatmap filters out other projects", async () => {
    const project2 = await ProjectsController.createProject({ title: "Other Project" });

    await SessionsController.createSession({ projectId, wordsWritten: 100, date: "2024-03-02" });
    await SessionsController.createSession({ projectId: project2.id, wordsWritten: 200, date: "2024-03-02" });

    const heatmap = await SessionsController.getProjectHeatmap(projectId, 7);
    const today = heatmap.find((d) => d.date === "2024-03-02");
    expect(today?.wordsWritten).toBe(100);
    expect(today?.sessions).toBe(1);
  });

  it("returns all zeros for project with no sessions", async () => {
    const heatmap = await SessionsController.getGlobalHeatmap(28);
    expect(heatmap).toHaveLength(28);
    expect(heatmap.every((d) => d.wordsWritten === 0 && d.sessions === 0)).toBe(true);
  });

  it("aggregates multiple sessions on the same day", async () => {
    await SessionsController.createSession({ projectId, wordsWritten: 200, date: "2024-03-02" });
    await SessionsController.createSession({ projectId, wordsWritten: 300, date: "2024-03-02" });

    const heatmap = await SessionsController.getGlobalHeatmap(7);
    const today = heatmap.find((d) => d.date === "2024-03-02");
    expect(today?.wordsWritten).toBe(500);
    expect(today?.sessions).toBe(2);
  });
});
