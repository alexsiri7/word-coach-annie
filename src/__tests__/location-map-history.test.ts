import { describe, it, expect } from "vitest";
import { commit, HISTORY_LIMIT, redo, startHistory, undo } from "@/components/location-map/history";

describe("location map history", () => {
    it("undoes and redoes commits in order", () => {
        let h = commit(commit(startHistory("a"), "b"), "c");
        h = undo(h);
        expect(h.present).toBe("b");
        h = undo(h);
        expect(h.present).toBe("a");
        expect(undo(h)).toBe(h);
        h = redo(h);
        expect(h.present).toBe("b");
    });

    it("drops the redo stack on a new commit", () => {
        const h = commit(undo(commit(startHistory("a"), "b")), "c");
        expect(h.future).toEqual([]);
        expect(redo(h)).toBe(h);
        expect(h.past).toEqual(["a"]);
    });

    it("ignores a commit of the current snapshot", () => {
        const h = startHistory("a");
        expect(commit(h, "a")).toBe(h);
    });

    it("keeps at most the last hundred steps", () => {
        let h = startHistory(0);
        for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i);
        expect(h.past).toHaveLength(HISTORY_LIMIT);
        expect(h.past[0]).toBe(20);
    });
});
