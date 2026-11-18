// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProvidersSection, type Provider } from "@/components/providers-section";

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

const provider: Provider = { id: "pr1", name: "Clarion", website: "https://clarion.example", notes: "" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function button(name: string, scope: ParentNode = document): HTMLButtonElement {
  const match = Array.from(scope.querySelectorAll("button")).find((b) => b.textContent?.trim() === name);
  if (!match) throw new Error(`No button named "${name}"`);
  return match;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

let container: HTMLDivElement;
let root: Root;
const onSaved = vi.fn();
const onDeleted = vi.fn();

async function render() {
  await act(async () =>
    root.render(<ProvidersSection providers={[provider]} onSaved={onSaved} onDeleted={onDeleted} />)
  );
}

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

describe("ProvidersSection", () => {
  it("edits a provider, sending a cleared website as null", async () => {
    const fetchMock = vi.fn(async () => json({ ...provider, name: "Clarion West", website: "" }));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    await click(button("Edit"));
    const dialog = document.querySelector('[role="dialog"]')!;
    const [name, website] = Array.from(dialog.querySelectorAll("input"));
    setInput(name, "Clarion West");
    setInput(website, "");
    await click(button("Save", dialog));

    expect(fetchMock).toHaveBeenCalledWith("/api/providers/pr1", expect.objectContaining({ method: "PATCH" }));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toEqual({ name: "Clarion West", website: null, notes: "" });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "pr1", name: "Clarion West" }));
  });

  it("keeps the confirmation open with the server's reason when a delete is refused", async () => {
    const reason = "Provider has existing submissions or opportunities and cannot be deleted.";
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: reason }, 409)));
    await render();
    await click(button("Delete"));
    const dialog = document.querySelector('[role="alertdialog"]')!;
    await click(button("Delete", dialog));

    expect(onDeleted).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(reason);
  });
});
