import { NextRequest, NextResponse } from "next/server";
import { StructureController } from "@/lib/controllers/structure";

// Deprecated: Use GET /api/projects/[id]/outline instead for the tree structure.
// If a flat list is needed, we should add a specific method for it, but the UI seems to want a tree.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

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
  } catch (error: any) {
    if (error.message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    console.error("Failed to list nodes:", error);
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

  try {
    const body = await request.json();
    // Validate required fields that might trigger controller errors if missing
    if (!body.type || !body.title) {
      return NextResponse.json(
        { error: "type and title are required" },
        { status: 400 }
      );
    }

    const node = await StructureController.createNode({
      projectId,
      ...body
    });

    return NextResponse.json(node, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create node:", error);
    if (error.message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (error.message.includes("type must be") || error.message.includes("status must be") || error.message.includes("Parent node not found")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
