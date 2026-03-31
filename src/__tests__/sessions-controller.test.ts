import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { SessionsController } from "@/lib/controllers/sessions";

describe("SessionsController", () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await testPrisma.project.create({
      data: { title: "Session Test Project", author: "Tester" },
    });
    projectId = project.id;
  });

  describe("createSession", () => {
    it("creates a session with default values", async () => {
      const session = await SessionsController.createSession({ projectId });

      expect(session.projectId).toBe(projectId);
      expect(session.wordsWritten).toBe(0);
      expect(session.durationSeconds).toBe(0);
      expect(session.date).toBeTruthy();
      expect(session.startedAt).toBeInstanceOf(Date);
    });

    it("creates a session with explicit values", async () => {
      const session = await SessionsController.createSession({
        projectId,
        wordsWritten: 500,
        durationSeconds: 1800,
        date: "2026-03-15",
      });

      expect(session.wordsWritten).toBe(500);
      expect(session.durationSeconds).toBe(1800);
      expect(session.date).toBe("2026-03-15");
    });

    it("creates a session with a nodeId", async () => {
      const node = await testPrisma.structureNode.create({
        data: {
          projectId,
          type: "SCENE",
          title: "Test Scene",
          orderIndex: 0,
        },
      });

      const session = await SessionsController.createSession({
        projectId,
        nodeId: node.id,
      });

      expect(session.nodeId).toBe(node.id);
    });
  });

  describe("updateSession", () => {
    it("updates session end time and word count", async () => {
      const session = await SessionsController.createSession({ projectId });

      const updated = await SessionsController.updateSession(session.id, {
        endedAt: new Date(),
        wordsWritten: 250,
        durationSeconds: 900,
      });

      expect(updated.wordsWritten).toBe(250);
      expect(updated.durationSeconds).toBe(900);
      expect(updated.endedAt).toBeInstanceOf(Date);
    });
  });

  describe("getProjectHeatmap", () => {
    it("returns 28 days by default with zero-fill", async () => {
      const heatmap = await SessionsController.getProjectHeatmap(projectId);

      expect(heatmap).toHaveLength(28);
      // All days should have 0 since no sessions exist
      for (const day of heatmap) {
        expect(day.wordsWritten).toBe(0);
        expect(day.sessions).toBe(0);
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it("aggregates sessions on the same day", async () => {
      const today = new Date().toISOString().slice(0, 10);

      await SessionsController.createSession({
        projectId,
        wordsWritten: 100,
        date: today,
      });
      await SessionsController.createSession({
        projectId,
        wordsWritten: 200,
        date: today,
      });

      const heatmap = await SessionsController.getProjectHeatmap(projectId);
      const todayEntry = heatmap.find((d) => d.date === today);

      expect(todayEntry).toBeDefined();
      expect(todayEntry!.wordsWritten).toBe(300);
      expect(todayEntry!.sessions).toBe(2);
    });

    it("respects custom days parameter", async () => {
      const heatmap = await SessionsController.getProjectHeatmap(projectId, 7);
      expect(heatmap).toHaveLength(7);
    });
  });

  describe("getGlobalHeatmap", () => {
    it("returns heatmap across all projects", async () => {
      const today = new Date().toISOString().slice(0, 10);

      // Create sessions in two different projects
      const project2 = await testPrisma.project.create({
        data: { title: "Second Project" },
      });

      await SessionsController.createSession({
        projectId,
        wordsWritten: 100,
        date: today,
      });
      await SessionsController.createSession({
        projectId: project2.id,
        wordsWritten: 150,
        date: today,
      });

      const heatmap = await SessionsController.getGlobalHeatmap();
      const todayEntry = heatmap.find((d) => d.date === today);

      expect(todayEntry!.wordsWritten).toBe(250);
      expect(todayEntry!.sessions).toBe(2);
    });

    it("filters by userId when provided", async () => {
      const user = await testPrisma.user.create({
        data: {
          email: "heatmap@test.com",
          googleId: "google-heatmap-test",
          name: "Heatmap User",
        },
      });

      const userProject = await testPrisma.project.create({
        data: { title: "User Project", userId: user.id },
      });

      const today = new Date().toISOString().slice(0, 10);

      // Session in user's project
      await SessionsController.createSession({
        projectId: userProject.id,
        wordsWritten: 500,
        date: today,
      });

      // Session in unowned project
      await SessionsController.createSession({
        projectId,
        wordsWritten: 999,
        date: today,
      });

      const heatmap = await SessionsController.getGlobalHeatmap(28, user.id);
      const todayEntry = heatmap.find((d) => d.date === today);

      expect(todayEntry!.wordsWritten).toBe(500);
      expect(todayEntry!.sessions).toBe(1);
    });
  });
});
