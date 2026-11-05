// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { ReportContentDialog } from "@/components/report-content-dialog";

vi.mock("@/lib/screenshot", () => ({
  captureScreenshot: vi.fn(async () => ({})),
  canvasToDataUrl: vi.fn(() => "data:image/png;base64,RAW"),
}));

vi.mock("@/components/screenshot-editor", () => ({
  ScreenshotEditor: ({ onSave }: { onSave: (dataUrl: string) => void }) => (
    <button onClick={() => onSave("data:image/png;base64,EDITED")}>Done</button>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function FeedbackHarness() {
  const [open, setOpen] = useState(true);
  return <FeedbackDialog open={open} onOpenChange={setOpen} />;
}

function button(name: string): HTMLButtonElement {
  const match = Array.from(document.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === name
  );
  if (!match) throw new Error(`No button named "${name}"`);
  return match;
}

function screenshotCheckbox(): HTMLInputElement {
  const box = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!box) throw new Error("No screenshot checkbox");
  return box;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

async function typeMessage(text: string) {
  const textarea = document.querySelector("textarea")!;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )!.set!;
  await act(async () => {
    setValue.call(textarea, text);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function captureAndSaveScreenshot() {
  await click(screenshotCheckbox());
  await click(button("Capture Screenshot"));
  // The dialog waits 350ms for itself to close before capturing.
  await act(() => new Promise((r) => setTimeout(r, 400)));
  await click(button("Done"));
  expect(document.querySelector('img[alt="Annotated screenshot"]')).not.toBeNull();
}

async function submitAndReadPayload(fetchMock: ReturnType<typeof vi.fn>) {
  await click(button("Submit"));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
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

describe("FeedbackDialog screenshot opt-in", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ issueUrl: "x" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<FeedbackHarness />));
    await typeMessage("Something broke");
  });

  it("tells the user the report is posted publicly", () => {
    expect(document.body.textContent).toContain("posted publicly as a GitHub issue");
  });

  it("sends a captured screenshot while the box stays ticked", async () => {
    await captureAndSaveScreenshot();
    const payload = await submitAndReadPayload(fetchMock);
    expect(payload.screenshot).toBe("data:image/png;base64,EDITED");
  });

  it("drops a captured screenshot once the box is unticked", async () => {
    await captureAndSaveScreenshot();
    await click(screenshotCheckbox());
    expect(screenshotCheckbox().checked).toBe(false);
    const payload = await submitAndReadPayload(fetchMock);
    expect(payload.screenshot).toBeUndefined();
  });
});

describe("ReportContentDialog", () => {
  it("tells the user the report is posted publicly", async () => {
    await act(async () =>
      root.render(
        <ReportContentDialog
          open
          onOpenChange={() => {}}
          projectId="p1"
          projectTitle="Book"
        />
      )
    );
    expect(document.body.textContent).toContain("posted publicly as a GitHub issue");
  });
});
