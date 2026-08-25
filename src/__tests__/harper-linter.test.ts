import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetup = vi.fn();
const mockLint = vi.fn().mockReturnValue([]);
const mockGetConfig = vi.fn().mockReturnValue({});
const mockSetConfig = vi.fn();

vi.mock("harper-wasm", () => ({
  setup: mockSetup,
  lint: mockLint,
  get_lint_config_as_object: mockGetConfig,
  set_lint_config_from_object: mockSetConfig,
}));

// Reset module singleton between tests
beforeEach(() => {
  vi.resetModules();
  mockSetup.mockReset();
  mockLint.mockReset();
  mockGetConfig.mockReset();
  mockSetConfig.mockReset();
  // Restore default happy-path implementations
  mockSetup.mockResolvedValue(undefined);
  mockLint.mockReturnValue([]);
  mockGetConfig.mockReturnValue({});
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
    mockLint.mockReturnValue(fakeLints);
    const { lintText } = await import("@/lib/linting/harper-linter");
    const result = await lintText("Hello");
    expect(result).toBe(fakeLints);
  });

  it("handles empty string input", async () => {
    mockLint.mockReturnValue([]);
    const { lintText } = await import("@/lib/linting/harper-linter");
    const result = await lintText("");
    expect(result).toEqual([]);
    expect(mockLint).toHaveBeenCalledWith("");
  });

  it("getLintConfig returns config after initialization", async () => {
    const fakeConfig = { spellCheck: true };
    mockGetConfig.mockReturnValue(fakeConfig);
    const { getLintConfig } = await import("@/lib/linting/harper-linter");
    const config = await getLintConfig();
    expect(config).toBe(fakeConfig);
    expect(mockSetup).toHaveBeenCalledTimes(1);
  });

  it("setLintConfig sets config after initialization", async () => {
    const { setLintConfig } = await import("@/lib/linting/harper-linter");
    await setLintConfig({ spellCheck: false });
    expect(mockSetConfig).toHaveBeenCalledWith({ spellCheck: false });
    expect(mockSetup).toHaveBeenCalledTimes(1);
  });

  it("propagates setup() failure to callers and allows retry", async () => {
    mockSetup.mockRejectedValueOnce(new Error("WASM load failed"));
    const { lintText } = await import("@/lib/linting/harper-linter");
    await expect(lintText("hello")).rejects.toThrow("WASM load failed");
    // After failure, initPromise is reset — next call retries setup
    mockSetup.mockResolvedValue(undefined);
    mockLint.mockReturnValue([]);
    const result = await lintText("hello again");
    expect(result).toEqual([]);
    expect(mockSetup).toHaveBeenCalledTimes(2);
  });

  it("calls setup only once under concurrent initialization", async () => {
    // Use a deferred promise so we can control when setup resolves
    let resolveSetup: (() => void) | undefined;
    const setupPromise = new Promise<void>((res) => { resolveSetup = res; });
    mockSetup.mockReturnValue(setupPromise);
    const { lintText } = await import("@/lib/linting/harper-linter");
    const p1 = lintText("first");
    const p2 = lintText("second");
    // Resolve setup after both calls are in-flight
    resolveSetup!();
    await Promise.all([p1, p2]);
    expect(mockSetup).toHaveBeenCalledTimes(1);
  });

  it("returns [] and logs when lint() throws after successful init", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockLint.mockImplementation(() => { throw new Error("WASM panic"); });
    const { lintText } = await import("@/lib/linting/harper-linter");
    const result = await lintText("some text");
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[harper-linter] lint() failed:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
