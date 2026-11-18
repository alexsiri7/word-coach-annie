// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import SubmissionsPage from "@/app/project/[id]/submissions/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/breadcrumbs", () => ({ Breadcrumbs: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/user-menu", () => ({ UserMenu: () => null }));
// Radix opens menus on pointer events jsdom does not dispatch; render the items inline instead.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: () => null,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const oldProvider = { id: "pr1", name: "Old Co" };
const contest = {
  id: "c1", projectId: "p1", providerId: "pr1", contestName: "Spring Prize", submissionDate: "2026-03-01",
  reviewDate: null, submissionUrl: "", status: "submitted", createdAt: "", updatedAt: "", provider: oldProvider,
};
const opportunity = {
  id: "o1", providerId: "pr1", title: "Autumn Award", closeDate: "2099-01-01", reviewDate: null, rulesUrl: null,
  entryFee: null, wordLimit: null, lineLimit: null, genreRestrictions: null, eligibilityNotes: null, status: "open",
  createdAt: "", updatedAt: "", provider: oldProvider,
  candidates: [{
    id: "cand1", opportunityId: "o1", projectId: "p1", state: "considering", submissionId: null,
    createdAt: "", updatedAt: "", project: { id: "p1", title: "Story" }, submission: null,
  }],
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function routeFetch(url: string, init?: RequestInit): Response {
  if (url === "/api/providers/pr1" && init?.method === "PATCH") {
    return json({ id: "pr1", name: "New Co", website: "", notes: "" });
  }
  if (url.endsWith("/submissions/contests")) return json({ submissions: [contest] });
  if (url.endsWith("/submissions/publications")) return json({ submissions: [] });
  if (url === "/api/projects/p1") return json({ title: "Story" });
  if (url === "/api/providers") return json({ providers: [{ ...oldProvider, website: "", notes: "" }] });
  if (url.startsWith("/api/opportunities")) return json({ opportunities: [opportunity] });
  throw new Error(`Unexpected fetch ${url}`);
}

function button(name: string, scope: ParentNode = document): HTMLButtonElement {
  const match = Array.from(scope.querySelectorAll("button")).find((b) => b.textContent?.trim() === name);
  if (!match) throw new Error(`No button named "${name}"`);
  return match;
}

function sectionText(heading: string): string {
  const h2 = Array.from(document.querySelectorAll("h2")).find((h) => h.textContent?.trim() === heading);
  if (!h2) throw new Error(`No section "${heading}"`);
  return h2.closest("section")!.textContent ?? "";
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SubmissionsPage", () => {
  it("shows a renamed provider everywhere the page names it", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => routeFetch(url, init)));
    await act(async () => root.render(<SubmissionsPage params={Promise.resolve({ id: "p1" })} />));
    expect(sectionText("Contests This Story Is Up For")).toContain("Old Co");
    expect(sectionText("Contest Submissions")).toContain("Old Co");

    const providers = Array.from(document.querySelectorAll("h2"))
      .find((h) => h.textContent?.trim() === "Providers")!
      .closest("section")!;
    // The contest and provider lists both have an "Edit" item; the provider's lives in its own section.
    await act(async () => button("Edit", providers).click());
    const dialog = document.querySelector('[role="dialog"]')!;
    const name = dialog.querySelector("input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "New Co");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Save", dialog).click());

    expect(sectionText("Contests This Story Is Up For")).toContain("New Co");
    expect(sectionText("Contest Submissions")).toContain("New Co");
  });
});
