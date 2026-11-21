// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import Dashboard from "@/app/page";

const toastError = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ error: toastError }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/offline/sync-queue", () => ({
  offlineFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));
vi.mock("@/lib/offline/cache-reads", () => ({ cacheProjects: vi.fn(), getCachedProjects: async () => [] }));
vi.mock("@/components/setup-wizard", () => ({ SetupWizard: () => null }));
vi.mock("@/components/writing-heatmap", () => ({ WritingHeatmap: () => null }));
vi.mock("@/components/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
// Radix menus open on pointer events jsdom does not synthesize; render the items inline instead.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIMIT_MESSAGE = "You've reached your 3 active project limit. Archive a project to create a new one.";
const project = (id: string, title: string) => ({
  id, title, author: "", synopsis: "", genre: "", projectType: "FICTION",
  createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z",
  wordCount: 0, sceneCount: 0, characterCount: 0,
});

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
    if (url === "/api/projects/p2/archive" && init?.method === "DELETE") return json({ error: LIMIT_MESSAGE }, 403);
    if (url === "/api/projects") return json({ projects: [project("p1", "Active")] });
    if (url === "/api/projects?archived=true") return json({ projects: [project("p2", "Shelved")] });
    return json({});
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(label: string) {
  return Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(label))!;
}

describe("Dashboard unarchive", () => {
  it("tells the author why a refused unarchive left the project archived", async () => {
    await act(async () => root.render(<Dashboard />));
    await act(async () => button("Archived (1)").click());

    await act(async () => button("Restore").click());

    expect(toastError).toHaveBeenCalledWith(LIMIT_MESSAGE);
    expect(container.textContent).toContain("Archived (1)");
  });
});
