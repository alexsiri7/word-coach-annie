import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetup = vi.fn().mockResolvedValue(undefined);
const mockLint = vi.fn().mockResolvedValue([]);
const mockGetLintConfig = vi.fn().mockResolvedValue({});
const mockSetLintConfig = vi.fn().mockResolvedValue(undefined);

vi.mock("harper.js", () => {
  const LocalLinter = vi.fn().mockImplementation(function () {
    return {
      setup: mockSetup,
      lint: mockLint,
      getLintConfig: mockGetLintConfig,
      setLintConfig: mockSetLintConfig,
    };
  });
  return { LocalLinter };
});

vi.mock("harper.js/binary", () => ({
  binary: { url: "mock-binary" },
}));

// Reset module singleton between tests
beforeEach(() => {
  vi.resetModules();
  mockSetup.mockReset().mockResolvedValue(undefined);
  mockLint.mockReset().mockResolvedValue([]);
  mockGetLintConfig.mockReset().mockResolvedValue({});
  mockSetLintConfig.mockReset().mockResolvedValue(undefined);
});

describe("harper-linter", () => {
  it("calls setup once and lint on each invocation", async () => {
    const { lintText } = await import("@/lib/linting/harper-linter");
    await lintText("Hello wrold");
    await lintText("Another sentence");
    expect(mockSetup).toHaveBeenCalledTimes(1);
    expect(mockLint).toHaveBeenCalledTimes(2);
    expect(mockLint).toHaveBeenCalledWith("Hello wrold");
    expect(mockLint).toHaveBeenCalledWith("Another sentence");
  });

  it("returns the array from lint()", async () => {
    const fakeLints = [{ span: { start: 0, end: 5 }, message: "test" }];
    mockLint.mockResolvedValue(fakeLints);
    const { lintText } = await import("@/lib/linting/harper-linter");
    const result = await lintText("Hello");
    expect(result).toBe(fakeLints);
  });

  it("handles empty string input", async () => {
    mockLint.mockResolvedValue([]);
    const { lintText } = await import("@/lib/linting/harper-linter");
    const result = await lintText("");
    expect(result).toEqual([]);
    expect(mockLint).toHaveBeenCalledWith("");
  });

  it("getLintConfig returns config after initialization", async () => {
    const fakeConfig = { spellCheck: true };
    mockGetLintConfig.mockResolvedValue(fakeConfig);
    const { getLintConfig } = await import("@/lib/linting/harper-linter");
    const config = await getLintConfig();
    expect(config).toBe(fakeConfig);
    expect(mockSetup).toHaveBeenCalledTimes(1);
  });

  it("setLintConfig sets config after initialization", async () => {
    const { setLintConfig } = await import("@/lib/linting/harper-linter");
    await setLintConfig({ spellCheck: false });
    expect(mockSetLintConfig).toHaveBeenCalledWith({ spellCheck: false });
    expect(mockSetup).toHaveBeenCalledTimes(1);
  });

  it("propagates setup() failure to callers and allows retry", async () => {
    mockSetup.mockRejectedValueOnce(new Error("WASM load failed"));
    const { lintText } = await import("@/lib/linting/harper-linter");
    await expect(lintText("hello")).rejects.toThrow("WASM load failed");
    // After failure, initPromise is reset — next call retries setup
    mockSetup.mockResolvedValue(undefined);
    mockLint.mockResolvedValue([]);
    const result = await lintText("hello again");
    expect(result).toEqual([]);
    expect(mockSetup).toHaveBeenCalledTimes(2);
  });

  it("calls setup only once under concurrent initialization", async () => {
    let resolveSetup: (() => void) | undefined;
    const setupPromise = new Promise<void>((res) => { resolveSetup = res; });
    mockSetup.mockReturnValue(setupPromise);
    const { lintText } = await import("@/lib/linting/harper-linter");
    const p1 = lintText("first");
    const p2 = lintText("second");
    resolveSetup!();
    await Promise.all([p1, p2]);
    expect(mockSetup).toHaveBeenCalledTimes(1);
  });

  it("returns [] and logs when lint() throws after successful init", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLint.mockRejectedValue(new Error("WASM panic"));
    const { lintText } = await import("@/lib/linting/harper-linter");
    const result = await lintText("some text");
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[harper-linter] lint() failed:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
