import { describe, it, expect } from "vitest";
import { saveErrorToast } from "@/components/editor/save-error";

describe("saveErrorToast", () => {
  it("tells the user their session expired on a 401", () => {
    expect(saveErrorToast(401, false)).toMatch(/session has expired/);
  });

  it("names the HTTP status for other failures", () => {
    expect(saveErrorToast(500, false)).toMatch(/HTTP 500/);
  });

  it("points at the connection when the request itself threw", () => {
    expect(saveErrorToast(0, false)).toMatch(/check your connection/);
  });

  it("stays quiet once the streak has been announced", () => {
    expect(saveErrorToast(401, true)).toBeNull();
    expect(saveErrorToast(500, true)).toBeNull();
    expect(saveErrorToast(0, true)).toBeNull();
  });
});
