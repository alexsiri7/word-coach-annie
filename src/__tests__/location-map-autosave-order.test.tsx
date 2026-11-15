// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LocationMap } from "@/components/location-map/location-map";
import type { LocationMapItem } from "@/schemas/location-map";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A stable toast functions object: location-map.tsx's load effect depends on `toastError`,
// so a mock that returns a fresh function on every render would re-trigger the load effect forever.
const toastFns = { error: vi.fn(), success: vi.fn() };
vi.mock("@/components/ui/toast", () => ({
  useToast: () => toastFns,
}));

let commitItem: ((item: LocationMapItem) => void) | null = null;

vi.mock("@/components/location-map/map-canvas", () => ({
  MapCanvas: (props: { onCommit: (item: LocationMapItem) => void }) => {
    commitItem = props.onCommit;
    return null;
  },
}));

const MAP_URL = "/api/story-objects/so-1/map";

const BASE_ITEM = {
  id: "item-1",
  kind: "note" as const,
  label: "Note",
  description: "",
  x: 1,
  y: 1,
  w: 0.4,
  h: 0.4,
  rotation: 0,
};

const SERVER_MAP = {
  widthM: 10,
  heightM: 8,
  backgroundImageId: null,
  items: [{ ...BASE_ITEM, linkName: null, unlinked: false }],
};

function mockResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("LocationMap autosave queue", () => {
  let root: Root;
  let container: HTMLDivElement;
  let puts: Array<{ resolve: (res: { ok: boolean; json: () => Promise<unknown> }) => void; body: { items: LocationMapItem[] } }>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    commitItem = null;
    puts = [];

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url === MAP_URL && init?.method === "PUT") {
          const body = JSON.parse(init.body as string);
          const d = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
          puts.push({ resolve: d.resolve, body });
          return d.promise;
        }
        if (url === MAP_URL) {
          return Promise.resolve(mockResponse({ data: SERVER_MAP }));
        }
        return Promise.resolve(mockResponse({ data: [] }));
      }),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("does not send a second edit's PUT until the first one resolves, and persists the last edit", async () => {
    await act(async () => {
      root.render(<LocationMap storyObjectId="so-1" projectId="proj-1" onOpenLocation={() => {}} />);
    });
    await act(async () => {
      await wait(10);
    });
    expect(commitItem).not.toBeNull();

    // First edit: debounce elapses and its PUT is sent, but left unresolved (in flight).
    await act(async () => {
      commitItem!({ ...BASE_ITEM, x: 2 });
    });
    await act(async () => {
      await wait(850);
    });
    expect(puts).toHaveLength(1);
    expect(puts[0].body.items[0].x).toBe(2);

    // Second edit: its own debounce elapses too, but the queue must hold its PUT back
    // behind the still-unresolved first one (src/components/location-map/location-map.tsx's
    // `saving.current` chain) rather than firing both PUTs concurrently.
    await act(async () => {
      commitItem!({ ...BASE_ITEM, x: 3 });
    });
    await act(async () => {
      await wait(850);
    });
    expect(puts).toHaveLength(1);

    // Resolving the first PUT unblocks the second.
    await act(async () => {
      puts[0].resolve(mockResponse({}));
      await wait(10);
    });
    expect(puts).toHaveLength(2);
    expect(puts[1].body.items[0].x).toBe(3);

    await act(async () => {
      puts[1].resolve(mockResponse({}));
      await wait(10);
    });
  }, 20000);
});
