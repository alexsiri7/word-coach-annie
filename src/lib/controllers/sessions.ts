import { prisma } from "@/lib/db";

export interface CreateSessionInput {
  projectId: string;
  nodeId?: string | null;
  startedAt?: Date;
  endedAt?: Date;
  wordsWritten?: number;
  durationSeconds?: number;
  date?: string; // YYYY-MM-DD
}

export interface UpdateSessionInput {
  endedAt?: Date;
  wordsWritten?: number;
  durationSeconds?: number;
}

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  wordsWritten: number;
  sessions: number;
}

export class SessionsController {
  static async createSession(input: CreateSessionInput) {
    const date = input.date ?? new Date().toISOString().slice(0, 10);
    return prisma.writingSession.create({
      data: {
        projectId: input.projectId,
        nodeId: input.nodeId ?? null,
        startedAt: input.startedAt ?? new Date(),
        endedAt: input.endedAt ?? null,
        wordsWritten: input.wordsWritten ?? 0,
        durationSeconds: input.durationSeconds ?? 0,
        date,
      },
    });
  }

  static async updateSession(id: string, input: UpdateSessionInput) {
    return prisma.writingSession.update({
      where: { id },
      data: input,
    });
  }

  static async getProjectHeatmap(projectId: string, days = 28): Promise<HeatmapDay[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().slice(0, 10);

    const sessions = await prisma.writingSession.findMany({
      where: {
        projectId,
        date: { gte: sinceDate },
      },
      select: { date: true, wordsWritten: true },
    });

    return aggregateHeatmap(sessions, days);
  }

  static async getGlobalHeatmap(days = 28): Promise<HeatmapDay[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().slice(0, 10);

    const sessions = await prisma.writingSession.findMany({
      where: { date: { gte: sinceDate } },
      select: { date: true, wordsWritten: true },
    });

    return aggregateHeatmap(sessions, days);
  }
}

function aggregateHeatmap(
  sessions: { date: string; wordsWritten: number }[],
  days: number,
): HeatmapDay[] {
  // Build map of date -> { wordsWritten, sessions }
  const map = new Map<string, { wordsWritten: number; sessions: number }>();
  for (const s of sessions) {
    const existing = map.get(s.date) ?? { wordsWritten: 0, sessions: 0 };
    existing.wordsWritten += s.wordsWritten;
    existing.sessions += 1;
    map.set(s.date, existing);
  }

  // Fill all days in range
  const result: HeatmapDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const data = map.get(dateStr) ?? { wordsWritten: 0, sessions: 0 };
    result.push({ date: dateStr, wordsWritten: data.wordsWritten, sessions: data.sessions });
  }
  return result;
}
