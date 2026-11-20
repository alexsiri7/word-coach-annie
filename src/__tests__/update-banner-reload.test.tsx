// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UpdateBanner } from "@/components/update-banner";

// WCA-037: a service worker taking control only surfaces the update banner;
// the page reloads only when the author clicks its refresh action.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reload = vi.fn();
const serviceWorker = new EventTarget();

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<UpdateBanner />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function refreshButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Refresh to update"
  );
}

describe("UpdateBanner reload policy (WCA-037)", () => {
  it("shows the banner on controllerchange without reloading", async () => {
    expect(refreshButton()).toBeUndefined();

    await act(async () => {
      serviceWorker.dispatchEvent(new Event("controllerchange"));
    });

    expect(refreshButton()).toBeDefined();
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads only when the refresh action is clicked", async () => {
    await act(async () => {
      serviceWorker.dispatchEvent(new Event("controllerchange"));
    });
    await act(async () => {
      refreshButton()!.click();
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
