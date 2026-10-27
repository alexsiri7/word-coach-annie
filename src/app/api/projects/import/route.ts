import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/api-auth";
import { importProjectJson, ImportValidationError } from "@/lib/import-json";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isGoogleAuthMode } from "@/lib/auth";
import { ActiveProjectLimitError } from "@/lib/project-limit";

const MAX_IMPORT_BODY_BYTES = 5 * 1024 * 1024; // 5MB

const bodyTooLarge = () =>
  NextResponse.json({ error: "Request body exceeds maximum size of 5MB" }, { status: 413 });

/** Reads the body as text, or returns null once it passes `maxBytes` — Content-Length can be absent or wrong. */
async function readBodyWithLimit(request: NextRequest, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request);

    if (isGoogleAuthMode() && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentLength = parseInt(request.headers.get("content-length") ?? "", 10);
    if (!isNaN(contentLength) && contentLength > MAX_IMPORT_BODY_BYTES) {
      return bodyTooLarge();
    }

    const text = await readBodyWithLimit(request, MAX_IMPORT_BODY_BYTES);
    if (text === null) return bodyTooLarge();

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object" || !body.project || !body.exportVersion) {
      return NextResponse.json(
        { error: "Invalid export format: missing project or exportVersion" },
        { status: 400 }
      );
    }

    const { projectId } = await importProjectJson(body as unknown as Parameters<typeof importProjectJson>[0], {
      userId: userId ?? undefined,
    });

    const project = await prisma.project.findUnique({ where: { id: projectId } });

    return NextResponse.json({ ...project, id: projectId }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof ImportValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ActiveProjectLimitError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // P2034 = transaction serialization failure (concurrent creates raced the limit check)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Request conflict, please try again." }, { status: 409 });
    }
    logger.error("POST /api/projects/import error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
