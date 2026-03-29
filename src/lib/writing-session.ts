// Writing session tracking — localStorage-based, no server dependency

const LAST_EDITED_KEY = (projectId: string) => `wca-last-scene-${projectId}`;
const SESSION_KEY = () => `wca-session-${today()}`;
const GOAL_KEY = "wca-daily-goal";
const BASELINE_KEY = (sceneId: string) => `wca-baseline-${sceneId}`;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export interface LastEditedScene {
  sceneId: string;
  sceneTitle: string;
  projectId: string;
  projectTitle: string;
  wordCount: number;
  ts: number;
}

export function recordLastEdited(
  projectId: string,
  projectTitle: string,
  sceneId: string,
  sceneTitle: string,
  wordCount: number
) {
  try {
    const data: LastEditedScene = {
      sceneId,
      sceneTitle,
      projectId,
      projectTitle,
      wordCount,
      ts: Date.now(),
    };
    localStorage.setItem(LAST_EDITED_KEY(projectId), JSON.stringify(data));
    // Also write to global "most recent" key across all projects
    localStorage.setItem("wca-last-scene-global", JSON.stringify(data));
  } catch {
    // localStorage may be unavailable
  }
}

export function getLastEdited(projectId: string): LastEditedScene | null {
  try {
    const raw = localStorage.getItem(LAST_EDITED_KEY(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as LastEditedScene;
  } catch {
    return null;
  }
}

export function getGlobalLastEdited(): LastEditedScene | null {
  try {
    const raw = localStorage.getItem("wca-last-scene-global");
    if (!raw) return null;
    return JSON.parse(raw) as LastEditedScene;
  } catch {
    return null;
  }
}

export function getDailyGoal(): number {
  try {
    const v = localStorage.getItem(GOAL_KEY);
    return v ? parseInt(v, 10) || 500 : 500;
  } catch {
    return 500;
  }
}

export function setDailyGoal(goal: number) {
  try {
    localStorage.setItem(GOAL_KEY, String(goal));
  } catch {
    // localStorage may be unavailable
  }
}

export function getTodayWords(): number {
  try {
    const raw = localStorage.getItem(SESSION_KEY());
    if (!raw) return 0;
    return (JSON.parse(raw) as { words: number }).words || 0;
  } catch {
    return 0;
  }
}

export function recordSessionBaseline(sceneId: string, wordCount: number) {
  try {
    // Only set baseline if not already set this session
    if (!localStorage.getItem(BASELINE_KEY(sceneId))) {
      localStorage.setItem(BASELINE_KEY(sceneId), String(wordCount));
    }
  } catch {
    // localStorage may be unavailable
  }
}

export function recordSave(sceneId: string, newWordCount: number) {
  try {
    const baselineRaw = localStorage.getItem(BASELINE_KEY(sceneId));
    const baseline = baselineRaw !== null ? parseInt(baselineRaw, 10) : newWordCount;
    const delta = Math.max(0, newWordCount - baseline);

    if (delta > 0) {
      const sessionKey = SESSION_KEY();
      const raw = localStorage.getItem(sessionKey);
      const session = raw ? (JSON.parse(raw) as { words: number }) : { words: 0 };
      session.words = (session.words || 0) + delta;
      localStorage.setItem(sessionKey, JSON.stringify(session));
    }
    // Update baseline to current word count
    localStorage.setItem(BASELINE_KEY(sceneId), String(newWordCount));
  } catch {
    // localStorage may be unavailable
  }
}
