// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import SettingsPage from "@/app/project/[id]/settings/page";

const toastError = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ error: toastError }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/offline/sync-queue", () => ({
  offlineFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIMIT_MESSAGE = "You've reached your 3 active project limit. Archive a project to create a new one.";
const archivedProject = {
  id: "p1", title: "Archived", author: "", synopsis: "", genre: "", archivedAt: "2026-11-01T00:00:00Z",
  wordCount: 0, sceneCount: 0, characterCount: 0, storyObjectCount: 0, nodeCount: 0,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/projects/p1/archive" && init?.method === "DELETE") return json({ error: LIMIT_MESSAGE }, 403);
    if (url === "/api/projects/p1") return json(archivedProject);
    return json({});
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SettingsPage unarchive", () => {
  it("tells the author why a refused unarchive left the project archived", async () => {
    const params = Promise.resolve({ id: "p1" });
    await act(async () => root.render(<Suspense><SettingsPage params={params} /></Suspense>));

    const restore = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Restore Project"));
    await act(async () => restore!.click());

    expect(toastError).toHaveBeenCalledWith(LIMIT_MESSAGE);
    expect(container.textContent).toContain("Archived");
  });
});
