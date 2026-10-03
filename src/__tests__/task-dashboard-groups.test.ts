import { describe, it, expect } from "vitest";
import { groupTasksByProject } from "@/lib/task-dashboard-groups";

const zebra = { id: "p-zebra", title: "Zebra Crossing" };
const amber = { id: "p-amber", title: "The Amber Throne" };

describe("groupTasksByProject", () => {
    it("sorts project groups by title and puts Practice last", () => {
        const groups = groupTasksByProject([
            { id: "1", project: null },
            { id: "2", project: zebra },
            { id: "3", project: amber },
        ]);
        expect(groups.map((g) => g.title)).toEqual(["The Amber Throne", "Zebra Crossing", "Practice"]);
        expect(groups.at(-1)).toMatchObject({ key: "practice", project: null });
    });

    it("omits Practice when every task has a project", () => {
        const groups = groupTasksByProject([{ id: "1", project: amber }]);
        expect(groups.map((g) => g.key)).toEqual(["p-amber"]);
    });

    it("keeps input order within a group", () => {
        const groups = groupTasksByProject([
            { id: "a", project: amber },
            { id: "b", project: null },
            { id: "c", project: amber },
            { id: "d", project: null },
            { id: "e", project: amber },
        ]);
        expect(groups[0].tasks.map((t) => t.id)).toEqual(["a", "c", "e"]);
        expect(groups[1].tasks.map((t) => t.id)).toEqual(["b", "d"]);
    });
});
