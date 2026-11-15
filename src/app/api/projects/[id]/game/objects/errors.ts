import { NextResponse } from "next/server";
import { NotFoundError, UserFacingError } from "@/lib/controllers/errors";
import { logger } from "@/lib/logger";

export function gameObjectErrorResponse(label: string, error: unknown): NextResponse {
  if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
  if (error instanceof UserFacingError) return NextResponse.json({ error: error.message }, { status: 400 });
  logger.error(`${label} error`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
