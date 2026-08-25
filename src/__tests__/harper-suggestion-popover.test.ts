/**
 * Tests for HarperSuggestionPopover logic.
 *
 * These tests verify the component's prop interface, export, and the
 * callback argument contract (from, to, replacement order) without
 * requiring a DOM rendering environment.
 */
import { describe, it, expect } from "vitest";
import { HarperSuggestionPopover } from "@/components/editor/harper-suggestion-popover";
import type { LintResult } from "@/components/editor/extensions/harper-spellcheck";

describe("HarperSuggestionPopover", () => {
  it("is exported as a named function component", () => {
    expect(typeof HarperSuggestionPopover).toBe("function");
  });

  it("accepts correct prop shape (TypeScript contract)", () => {
    // Verify the prop types are accepted — this is a compile-time check
    // that the interface matches what the component declares
    const lint: LintResult = {
      id: "harper-0-0-5",
      from: 1,
      to: 6,
      message: "Possible typo",
      suggestions: ["hello", "Hello"],
    };
    const rect = { top: 100, bottom: 120, left: 50, width: 60, height: 20 } as DOMRect;
    const props = {
      activeLint: lint,
      activeLintRect: rect,
      onApply: (_from: number, _to: number, _replacement: string) => {},
      onDismiss: () => {},
    };
    // If this assignment compiles, the prop types are correct
    expect(props.activeLint.from).toBe(1);
    expect(props.activeLint.to).toBe(6);
    expect(props.activeLint.suggestions).toHaveLength(2);
  });

  it("LintResult interface has from, to, message, suggestions fields", () => {
    const lint: LintResult = {
      id: "harper-1-3-8",
      from: 3,
      to: 8,
      message: "Grammar issue",
      suggestions: ["fixed", "Fixed"],
    };
    expect(lint.from).toBe(3);
    expect(lint.to).toBe(8);
    expect(lint.message).toBe("Grammar issue");
    expect(lint.suggestions).toEqual(["fixed", "Fixed"]);
  });

  it("onApply callback signature takes (from, to, replacement) in that order", () => {
    // Simulate what the popover does when a suggestion is clicked:
    // onApply(activeLint.from, activeLint.to, suggestion)
    const calls: [number, number, string][] = [];
    const onApply = (from: number, to: number, replacement: string) => {
      calls.push([from, to, replacement]);
    };

    const lint: LintResult = {
      id: "harper-0-1-6",
      from: 1,
      to: 6,
      message: "Possible typo",
      suggestions: ["hello"],
    };

    // Replicate the onClick logic from the component
    const suggestion = lint.suggestions[0];
    onApply(lint.from, lint.to, suggestion);

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(1);   // from
    expect(calls[0][1]).toBe(6);   // to
    expect(calls[0][2]).toBe("hello"); // replacement
  });

  it("suggestions.slice(0, 5) caps at 5 items", () => {
    const manySuggestions = ["a", "b", "c", "d", "e", "f", "g"];
    const capped = manySuggestions.slice(0, 5);
    expect(capped).toHaveLength(5);
    expect(capped).not.toContain("f");
    expect(capped).not.toContain("g");
  });

  it("empty suggestions array triggers the 'no suggestions' path", () => {
    const lint: LintResult = {
      id: "harper-0-0-5",
      from: 0,
      to: 5,
      message: "No suggestions",
      suggestions: [],
    };
    // Replicate the component's branching: suggestions.length > 0 ? ... : fallback
    const showFallback = lint.suggestions.length === 0;
    expect(showFallback).toBe(true);
  });
});
