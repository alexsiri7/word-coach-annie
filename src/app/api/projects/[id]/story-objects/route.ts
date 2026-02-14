import { NextRequest, NextResponse } from "next/server";
import { StoryObjectController } from "@/lib/controllers/story-objects";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = request.nextUrl;

    // Extract query params
    const type = searchParams.get("type") || undefined;
    const search = searchParams.get("search") || undefined;
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      200
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") || "0", 10) || 0,
      0
    );

    const result = await StoryObjectController.listStoryObjects({
      projectId,
      type,
      search,
      limit,
      offset
    });

    // The controller returns { objects, total }
    // The API previously returned { data: storyObjects, total, limit, offset }
    // We map `objects` to `data` to maintain API compatibility

    return NextResponse.json({
      data: result.objects,
      total: result.total,
      limit,
      offset,
    });

  } catch (error: any) {
    if (error.message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (error.message.includes("Invalid type")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("GET /api/projects/[id]/story-objects error:", error);
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
  try {
    const { id: projectId } = await params;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // We pass the body directly to the controller, casting it to the expected type
    // The controller validates required fields like name and type.

    const storyObject = await StoryObjectController.createStoryObject({
      projectId,
      ...(body as any)
    });

    return NextResponse.json(storyObject, { status: 201 });
  } catch (error: any) {
    if (error.message.includes("Project not found")) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (error.message.includes("name is required") || error.message.includes("Invalid type") || error.message.includes("type is required")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/projects/[id]/story-objects error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
