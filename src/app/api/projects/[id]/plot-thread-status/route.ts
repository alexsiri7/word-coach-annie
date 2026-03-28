import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectAccess } from "@/lib/api-auth";

export type PlotlineStatus = "advancing" | "mentioned" | "dormant";

export interface PlotlineIndicator {
  id: string;
  name: string;
  status: PlotlineStatus;
  lastSeenTitle?: string;
}

export interface ScenePlotThreadStatus {
  sceneId: string;
  indicators: PlotlineIndicator[];
}

/**
 * GET /api/projects/[id]/plot-thread-status
 *
 * Returns plotline status indicators for each scene in story order.
 * - advancing: plotline linked to this scene AND appeared in a prior scene
 * - mentioned: plotline linked to this scene for the first time (introduced here)
 * - dormant: plotline appeared in a prior scene but is absent from this scene
 *   (only included for plotlines that have been seen at least once)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectAccess(projectId, userId);
  if (!access.authorized) return access.response;

  try {
    // Load all scenes in story order (part → chapter → scene hierarchy)
    const allNodes = await prisma.structureNode.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
      select: { id: true, type: true, title: true, parentId: true, orderIndex: true },
    });

    // Load all plotlines for this project
    const plotlines = await prisma.storyObject.findMany({
      where: { projectId, type: "PLOTLINE" },
      select: { id: true, name: true },
    });

    if (plotlines.length === 0) {
      return NextResponse.json([]);
    }

    const plotlineIds = plotlines.map((p) => p.id);
    const sceneIds = allNodes.filter((n) => n.type === "SCENE").map((n) => n.id);

    if (sceneIds.length === 0) {
      return NextResponse.json([]);
    }

    // Load all relationships between plotlines and scenes
    const relationships = await prisma.relationship.findMany({
      where: {
        OR: [
          { fromObjectId: { in: plotlineIds }, toNodeId: { in: sceneIds } },
          { fromNodeId: { in: sceneIds }, toObjectId: { in: plotlineIds } },
        ],
      },
      select: {
        fromObjectId: true,
        fromNodeId: true,
        toObjectId: true,
        toNodeId: true,
      },
    });

    // Build a map: sceneId → Set<plotlineId>
    const sceneToPlotlines = new Map<string, Set<string>>();
    for (const rel of relationships) {
      const sceneId = rel.fromNodeId ?? rel.toNodeId;
      const plotlineId = rel.fromObjectId ?? rel.toObjectId;
      if (!sceneId || !plotlineId) continue;
      if (!sceneToPlotlines.has(sceneId)) {
        sceneToPlotlines.set(sceneId, new Set());
      }
      sceneToPlotlines.get(sceneId)!.add(plotlineId);
    }

    // Build an ordered list of scenes (respecting hierarchy)
    const orderedScenes = buildOrderedScenes(allNodes);

    // For each scene, compute indicators
    // Track which plotlines have been seen so far
    const plotlineLastSeenTitle = new Map<string, string>(); // plotlineId → last scene title
    const plotlineMap = new Map(plotlines.map((p) => [p.id, p.name]));

    const result: ScenePlotThreadStatus[] = [];

    for (const scene of orderedScenes) {
      const activePlotlineIds = sceneToPlotlines.get(scene.id) ?? new Set<string>();
      const indicators: PlotlineIndicator[] = [];

      // Active plotlines in this scene
      for (const plotlineId of activePlotlineIds) {
        const name = plotlineMap.get(plotlineId) ?? "Unknown";
        const wasSeenBefore = plotlineLastSeenTitle.has(plotlineId);
        indicators.push({
          id: plotlineId,
          name,
          status: wasSeenBefore ? "advancing" : "mentioned",
        });
      }

      // Dormant plotlines: seen before but absent from this scene
      for (const [plotlineId, lastTitle] of plotlineLastSeenTitle.entries()) {
        if (!activePlotlineIds.has(plotlineId)) {
          const name = plotlineMap.get(plotlineId) ?? "Unknown";
          indicators.push({
            id: plotlineId,
            name,
            status: "dormant",
            lastSeenTitle: lastTitle,
          });
        }
      }

      result.push({ sceneId: scene.id, indicators });

      // Update last seen for active plotlines
      for (const plotlineId of activePlotlineIds) {
        plotlineLastSeenTitle.set(plotlineId, scene.title);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("GET /api/projects/[id]/plot-thread-status error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

interface NodeInfo {
  id: string;
  type: string;
  title: string;
  parentId: string | null;
  orderIndex: number;
}

function buildOrderedScenes(nodes: NodeInfo[]): NodeInfo[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string | null, NodeInfo[]>();

  for (const node of nodes) {
    const key = node.parentId ?? null;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(node);
  }

  // Sort children at each level by orderIndex
  for (const children of childrenMap.values()) {
    children.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  const scenes: NodeInfo[] = [];
  function traverse(parentId: string | null) {
    const children = childrenMap.get(parentId) ?? [];
    for (const child of children) {
      if (child.type === "SCENE") {
        scenes.push(child);
      } else {
        traverse(child.id);
      }
    }
  }

  traverse(null);
  return scenes;
}
