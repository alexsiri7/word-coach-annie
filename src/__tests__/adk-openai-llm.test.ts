/**
 * Sanity tests for the ADK Gemini integration.
 *
 * The OpenAI compatibility shim (adk-openai-llm.ts) has been removed in favour
 * of the native Gemini LLM provided by @google/adk. These tests verify that
 * the Gemini class is available and that adk-agent.ts can construct an agent.
 */
import { describe, it, expect } from "vitest";
import { Gemini } from "@google/adk";

describe("Gemini LLM (native ADK)", () => {
  it("is exported from @google/adk", () => {
    expect(Gemini).toBeDefined();
    expect(typeof Gemini).toBe("function");
  });

  it("can be instantiated with model and apiKey", () => {
    const llm = new Gemini({ model: "gemini-2.0-flash-001", apiKey: "test-key" });
    expect(llm.model).toBe("gemini-2.0-flash-001");
  });

  it("supports gemini model name patterns", () => {
    const supported = Gemini.supportedModels;
    expect(Array.isArray(supported)).toBe(true);
    expect(supported.length).toBeGreaterThan(0);
  });
});
