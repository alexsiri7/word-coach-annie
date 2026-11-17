// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import LoginPage from "@/app/login/page";

const router = { push: vi.fn(), replace: vi.fn() };
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => new Response(null, { status: url === "/api/auth/login" ? 200 : 401 }))
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(name: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === name);
  if (!match) throw new Error(`No button named "${name}"`);
  return match;
}

async function loginWithToken(from: string) {
  searchParams = new URLSearchParams({ from });
  await act(async () => root.render(<LoginPage />));
  await act(async () => button("Sign in with access token").click());

  const input = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, "secret-token");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button("Sign in with token").click());
}

describe("access-token login redirect", () => {
  it.each(["/\\evil.com", "/%09/evil.com", "//evil.com", "https://evil.com"])(
    "falls back to / for off-site from=%s",
    async (from) => {
      await loginWithToken(from);
      expect(router.push).toHaveBeenCalledWith("/");
    }
  );

  it("follows an allow-listed from", async () => {
    await loginWithToken("/project/abc123");
    expect(router.push).toHaveBeenCalledWith("/project/abc123");
  });
});
