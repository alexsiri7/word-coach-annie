import { z } from "zod";

const updatingVersion = "ensures you are updating the version you read";

// Stale-write tokens shared by the MCP server and the in-app chat tools, so
// both surfaces expose the same contract for each guarded write.
export const ContentHash = {
  project: z.string().describe(`The contentHash from get_project — ${updatingVersion}`),
  node: z.string().describe(`The contentHash for this node from get_outline — ${updatingVersion}`),
  scene: z.string().describe("The contentHash from read_scene_content — ensures you are writing over the version you read"),
  storyObject: z.string().describe(`The contentHash from get_story_object — ${updatingVersion}`),
  universe: z.string().describe(`The contentHash from get_universe — ${updatingVersion}`),
  worldObject: z.string().describe(`The contentHash from get_world_object — ${updatingVersion}`),
  timelineEntry: z.string().describe(`The contentHash for this entry from get_world_object's timeline array — ${updatingVersion}`),
};
