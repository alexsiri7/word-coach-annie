import { NextRequest, NextResponse } from "next/server";
import { StructureController } from "@/lib/controllers/structure";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectReadAccess, verifyProjectWriteAccess } from "@/lib/api-auth";
import { NodeCreateSchema } from "@/schemas/nodes";

// Deprecated: Use GET /api/projects/[id]/outline instead for the tree structure.
// If a flat list is needed, we should add a specific method for it, but the UI seems to want a tree.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectReadAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    // For now, return the tree structure as 'tree' property to match what might be expected if we change the frontend
    // OR if we want to fix the bug, we should probably check what the frontend expects.
    // The frontend `ProjectPage` calls `/api/projects/${projectId}/nodes` and expects `data.tree`?
    // Wait, let's look at `src/components/outline-tree.tsx` or `ProjectPage`.
    // The ProjectPage `fetchOutline` calls `/api/projects/${projectId}/nodes` and expects `res.json()` then `setOutline(data.tree || [])`.
    // BUT the previous implementation of GET /nodes returned a FLAT list array directly: `return NextResponse.json(result);`.
    // This means `data.tree` would be undefined on a flat array.
    // THE BUG is that the frontend expects `{ tree: ... }` or a tree structure, but `/nodes` returned a flat list.
    // AND the frontend probably changed recently to expect a tree structure from `/nodes`?
    // actually `src/app/project/[id]/page.tsx` line 94: `setOutline(data.tree || []);`
    // The `outline` endpoint returns an array of roots.
    // So I should make this return `{ tree: roots }` using the controller.

    const roots = await StructureController.getOutline(projectId);
    return NextResponse.json({ tree: roots });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    logger.error("Failed to list nodes", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    const body = await request.json();
    const parsed = NodeCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const node = await StructureController.createNode({
      projectId,
      ...parsed.data,
    });

    return NextResponse.json(node, { status: 201 });
  } catch (error: unknown) {
    logger.error("Failed to create node", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (message.includes("type must be") || message.includes("status must be")) {
      return NextResponse.json({ error: "Invalid node type or status" }, { status: 400 });
    }
    if (message.includes("Parent node not found")) {
      return NextResponse.json({ error: "Parent node not found" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
