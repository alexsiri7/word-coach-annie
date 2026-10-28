import { describe, it, expect } from "vitest";
import { sanitizeDisplayHtml } from "@/lib/sanitize-display";

describe("sanitizeDisplayHtml", () => {
  it("strips style attributes, which the CSP's style-src does not allow", () => {
    const result = sanitizeDisplayHtml(
      '<p style="color:red">Queen <span style="font-weight:bold">Mira</span></p>'
    );
    expect(result).toBe("<p>Queen <span>Mira</span></p>");
  });

  it("strips style attributes on added tags", () => {
    expect(sanitizeDisplayHtml('<mark style="background:red">x</mark>', ["mark"])).toBe(
      "<mark>x</mark>"
    );
  });

  it("keeps <mark> only when added", () => {
    expect(sanitizeDisplayHtml("<mark>x</mark>", ["mark"])).toBe("<mark>x</mark>");
  });

  it("strips scripts and event handlers", () => {
    expect(sanitizeDisplayHtml('<p onclick="alert(1)">a</p><script>alert(1)</script>')).toBe(
      "<p>a</p>"
    );
  });
});
