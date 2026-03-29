import { prisma } from "@/lib/db";

export interface PartProgress {
  id: string;
  title: string;
  type: string;
  totalScenes: number;
  draftedScenes: number; // DRAFT | REVISED | FINAL
  revisedScenes: number; // REVISED | FINAL
  finalScenes: number;   // FINAL
  outlineScenes: number; // OUTLINE only
  totalWords: number;
}

export interface NextScene {
  id: string;
  title: string;
  status: string;
  synopsis: string;
  parentTitle: string | null;
}

export interface ProjectProgress {
  totalWords: number;
  totalScenes: number;
  draftedScenes: number;
  revisedScenes: number;
  finalScenes: number;
  outlineScenes: number;
  parts: PartProgress[];
  nextScene: NextScene | null;
}

export class ProgressController {
  static async getProjectProgress(projectId: string): Promise<ProjectProgress> {
    // Get all structure nodes with latest content version word counts
    const nodes = await prisma.structureNode.findMany({
      where: { projectId },
      orderBy: [{ orderIndex: "asc" }],
      include: {
        contentVersions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { wordCount: true },
        },
        children: {
          orderBy: [{ orderIndex: "asc" }],
          include: {
            contentVersions: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { wordCount: true },
            },
            children: {
              orderBy: [{ orderIndex: "asc" }],
              include: {
                contentVersions: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { wordCount: true },
                },
              },
            },
          },
        },
      },
    });

    // Get only top-level nodes (parentId = null)
    const topLevel = nodes.filter((n) => n.parentId === null);

    let totalWords = 0;
    let totalScenes = 0;
    let draftedScenes = 0;
    let revisedScenes = 0;
    let finalScenes = 0;
    let outlineScenes = 0;
    const parts: PartProgress[] = [];
    let nextScene: NextScene | null = null;

    // Flatten all scenes for next-scene calculation
    const allScenes: { id: string; title: string; status: string; synopsis: string; parentId: string | null }[] = [];

    const processNode = (n: typeof nodes[0]) => {
      if (n.type === "SCENE") {
        const wc = n.contentVersions[0]?.wordCount ?? 0;
        totalWords += wc;
        totalScenes++;
        allScenes.push({ id: n.id, title: n.title, status: n.status, synopsis: n.synopsis, parentId: n.parentId });
        if (n.status === "OUTLINE") outlineScenes++;
        else if (n.status === "DRAFT") draftedScenes++;
        else if (n.status === "REVISED") revisedScenes++;
        else if (n.status === "FINAL") finalScenes++;
      }
    };

    // Process tree to collect parts at top level
    for (const topNode of topLevel) {
      if (topNode.type === "PART" || topNode.type === "CHAPTER") {
        // Collect scenes for this part
        let partWords = 0;
        let partTotal = 0;
        let partDrafted = 0;
        let partRevised = 0;
        let partFinal = 0;
        let partOutline = 0;

        const walkChildren = (node: typeof nodes[0]) => {
          if (node.type === "SCENE") {
            const wc = node.contentVersions[0]?.wordCount ?? 0;
            partWords += wc;
            totalWords += wc;
            totalScenes++;
            partTotal++;
            allScenes.push({ id: node.id, title: node.title, status: node.status, synopsis: node.synopsis, parentId: node.parentId });
            if (node.status === "OUTLINE") { outlineScenes++; partOutline++; }
            else if (node.status === "DRAFT") { draftedScenes++; partDrafted++; }
            else if (node.status === "REVISED") { revisedScenes++; partRevised++; }
            else if (node.status === "FINAL") { finalScenes++; partFinal++; }
          }
          for (const child of node.children ?? []) {
            walkChildren(child as typeof nodes[0]);
          }
        };

        for (const child of topNode.children ?? []) {
          walkChildren(child as typeof nodes[0]);
        }
        // Also check if the top node itself is a SCENE (shouldn't be for PART/CHAPTER but handle gracefully)

        parts.push({
          id: topNode.id,
          title: topNode.title,
          type: topNode.type,
          totalScenes: partTotal,
          draftedScenes: partDrafted,
          revisedScenes: partRevised,
          finalScenes: partFinal,
          outlineScenes: partOutline,
          totalWords: partWords,
        });
      } else if (topNode.type === "SCENE") {
        processNode(topNode);
      }
    }

    // If no top-level parts, use flat scene list (projects without parts)
    // Already processed via processNode above for SCENE top-nodes

    // Find next scene: first OUTLINE or DRAFT scene
    const priorityOrder = ["OUTLINE", "DRAFT", "REVISED"];
    for (const status of priorityOrder) {
      const scene = allScenes.find((s) => s.status === status);
      if (scene) {
        // Find parent title
        const parent = scene.parentId ? nodes.find((n) => n.id === scene.parentId) : null;
        nextScene = {
          id: scene.id,
          title: scene.title,
          status: scene.status,
          synopsis: scene.synopsis,
          parentTitle: parent?.title ?? null,
        };
        break;
      }
    }

    return {
      totalWords,
      totalScenes,
      draftedScenes,
      revisedScenes,
      finalScenes,
      outlineScenes,
      parts,
      nextScene,
    };
  }
}
