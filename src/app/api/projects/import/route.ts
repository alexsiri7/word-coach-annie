import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/api-auth";
import { importProjectJson } from "@/lib/import-json";

export async function POST(request: NextRequest) {
  const userId = getCurrentUserId(request);

  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  try {
    const result = await importProjectJson(data, userId);
    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
