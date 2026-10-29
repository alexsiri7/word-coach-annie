import { describe, it, expect } from "vitest";
import { linkableProjects } from "@/lib/universe-projects";

describe("linkableProjects", () => {
  const projects = [
    { id: "p-1", title: "One" },
    { id: "p-2", title: "Two" },
    { id: "p-3", title: "Three" },
  ];

  it("excludes projects already linked to the universe", () => {
    const universe = { projects: [{ id: "p-2", title: "Two" }] };

    expect(linkableProjects(projects, universe).map((p) => p.id)).toEqual(["p-1", "p-3"]);
  });

  it("offers every project when the universe has none linked", () => {
    expect(linkableProjects(projects, { projects: [] })).toEqual(projects);
    expect(linkableProjects(projects, {})).toEqual(projects);
  });
});
