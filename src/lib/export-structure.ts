import { prisma } from "@/lib/db";

export interface StructureExportScene {
  id: string;
  type: "SCENE";
  title: string;
  synopsis: string;
  status: string;
  orderIndex: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StructureExportChapter {
  id: string;
  type: "CHAPTER";
  title: string;
  synopsis: string;
  status: string;
  orderIndex: number;
  wordCount: number;
  scenes: StructureExportScene[];
  createdAt: string;
  updatedAt: string;
}

export interface StructureExportPart {
  id: string;
  type: "PART";
  title: string;
  synopsis: string;
  status: string;
  orderIndex: number;
  wordCount: number;
  chapters: StructureExportChapter[];
  createdAt: string;
  updatedAt: string;
}

export type StructureExportNode =
  | StructureExportPart
  | StructureExportChapter
  | StructureExportScene;

export interface ProjectStructureExport {
  schemaVersion: "1.0";
  exportedAt: string;
  project: {
    id: string;
    title: string;
    author: string;
    synopsis: string;
    genre: string;
    projectType: string;
    wordCount: number;
    createdAt: string;
    updatedAt: string;
  };
  structure: (StructureExportPart | StructureExportChapter | StructureExportScene)[];
}

export async function exportProjectStructure(
  projectId: string
): Promise<ProjectStructureExport> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project) throw new Error(`Project not found: ${projectId}`);

  // Fetch nodes with latest content version word count
  const nodes = await prisma.structureNode.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
    include: {
      contentVersions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { wordCount: true },
      },
    },
  });

  // Build word count map from latest content versions
  const wordCountMap = new Map<string, number>();
  for (const node of nodes) {
    const latestVersion = node.contentVersions[0];
    wordCountMap.set(node.id, latestVersion?.wordCount ?? 0);
  }

  // Build parent-children map
  const childrenMap = new Map<string | null, typeof nodes>();
  for (const node of nodes) {
    const key = node.parentId;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(node);
  }

  function buildScene(node: (typeof nodes)[0]): StructureExportScene {
    return {
      id: node.id,
      type: "SCENE",
      title: node.title,
      synopsis: node.synopsis,
      status: node.status,
      orderIndex: node.orderIndex,
      wordCount: wordCountMap.get(node.id) ?? 0,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    };
  }

  function buildChapter(node: (typeof nodes)[0]): StructureExportChapter {
    const children = childrenMap.get(node.id) ?? [];
    const scenes = children
      .filter((c) => c.type === "SCENE")
      .map(buildScene);
    const wordCount = scenes.reduce((sum, s) => sum + s.wordCount, 0);
    return {
      id: node.id,
      type: "CHAPTER",
      title: node.title,
      synopsis: node.synopsis,
      status: node.status,
      orderIndex: node.orderIndex,
      wordCount,
      scenes,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    };
  }

  function buildPart(node: (typeof nodes)[0]): StructureExportPart {
    const children = childrenMap.get(node.id) ?? [];
    const chapters = children
      .filter((c) => c.type === "CHAPTER")
      .map(buildChapter);
    const wordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
    return {
      id: node.id,
      type: "PART",
      title: node.title,
      synopsis: node.synopsis,
      status: node.status,
      orderIndex: node.orderIndex,
      wordCount,
      chapters,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    };
  }

  // Build top-level structure from root nodes (no parent)
  const roots = childrenMap.get(null) ?? [];
  const structure: (StructureExportPart | StructureExportChapter | StructureExportScene)[] = [];

  for (const root of roots) {
    if (root.type === "PART") {
      structure.push(buildPart(root));
    } else if (root.type === "CHAPTER") {
      structure.push(buildChapter(root));
    } else {
      structure.push(buildScene(root));
    }
  }

  const totalWordCount = structure.reduce((sum, node) => {
    return sum + ("wordCount" in node ? node.wordCount : 0);
  }, 0);

  return {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      author: project.author,
      synopsis: project.synopsis,
      genre: project.genre,
      projectType: project.projectType,
      wordCount: totalWordCount,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    structure,
  };
}
