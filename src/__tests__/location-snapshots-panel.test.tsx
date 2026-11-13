// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LocationSnapshots } from "@/components/location-snapshots/location-snapshots";
import type { SnapshotThing } from "@/schemas/location-snapshots";

const toastError = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ error: toastError }) }));

vi.mock("@/components/location-snapshots/snapshot-canvas", () => ({
  SnapshotCanvas: ({ things, onSelectThing }: { things: SnapshotThing[]; onSelectThing: (key: string) => void }) => (
    <div>
      {things.map((t) => (
        <button key={t.key} onClick={() => onSelectThing(t.key)}>{`thing:${t.key}`}</button>
      ))}
    </div>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SNAPSHOT_ID = "snap1";
const thing: SnapshotThing = { key: "door", name: "Door", description: "In the game", kind: "", box: { x: 0, y: 0, w: 10, h: 10 } };

function annotation(id: string, fields: Record<string, unknown>) {
  return { id, snapshotId: SNAPSHOT_ID, thingKey: null, region: null, storyObjectId: null, status: "open", ...fields };
}

type Route = (method: string, url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(annotations: unknown[], route: Route = () => undefined) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const routed = await route(method, url, init);
    if (routed) return routed;
    if (url === "/api/story-objects/loc1/snapshots") {
      return json({
        data: [{ id: SNAPSHOT_ID, build: "1", takenAt: "2026-11-01T00:00:00Z", width: 100, height: 100, thingCount: 1 }],
        annotations,
      });
    }
    if (url.startsWith("/api/projects/p1/story-objects")) return json({ data: [] });
    if (url === `/api/location-snapshots/${SNAPSHOT_ID}`) {
      return json({ id: SNAPSHOT_ID, build: "1", takenAt: "2026-11-01T00:00:00Z", width: 100, height: 100, thingCount: 1, things: [thing], imageUrl: "/x.webp" });
    }
    throw new Error(`Unexpected fetch ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function button(name: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === name || b.getAttribute("aria-label") === name
  );
  if (!match) throw new Error(`No button named "${name}"`);
  return match;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

async function render() {
  await act(async () => root.render(<LocationSnapshots storyObjectId="loc1" projectId="p1" />));
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

describe("LocationSnapshots requested changes", () => {
  it("pre-fills a thing with its open request, not an older sent one", async () => {
    stubFetch([
      annotation("a1", { kind: "description", thingKey: "door", text: "Sent to the game", status: "sent" }),
      annotation("a2", { kind: "description", thingKey: "door", text: "Newest wording" }),
    ]);
    await render();
    await click(button("thing:door"));
    expect(document.querySelector<HTMLTextAreaElement>("#thing-description")!.value).toBe("Newest wording");
  });
});

describe("LocationSnapshots annotation failures", () => {
  const note = annotation("n1", { kind: "note", text: "Too dark", region: { type: "point", x: 1, y: 1 } });

  it.each([
    ["offline", () => Promise.reject(new TypeError("Failed to fetch")), "Could not resolve"],
    ["refused", () => json({ error: "Snapshot annotation not found" }, 404), "Snapshot annotation not found"],
  ])("tells the author when resolving fails (%s)", async (_case, respond, message) => {
    stubFetch([note], (method, url) => (method === "PATCH" && url === "/api/snapshot-annotations/n1" ? respond() : undefined));
    await render();
    await click(button("Resolve"));
    expect(toastError).toHaveBeenCalledWith(message);
  });

  it.each([
    ["offline", () => Promise.reject(new TypeError("Failed to fetch")), "Could not delete"],
    ["refused", () => json({ error: "Snapshot annotation not found" }, 404), "Snapshot annotation not found"],
  ])("tells the author when deleting fails (%s)", async (_case, respond, message) => {
    stubFetch([note], (method, url) => (method === "DELETE" && url === "/api/snapshot-annotations/n1" ? respond() : undefined));
    await render();
    await click(button("Delete"));
    const confirm = Array.from(document.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent === "Delete");
    await click(confirm as HTMLElement);
    expect(toastError).toHaveBeenCalledWith(message);
  });
});
