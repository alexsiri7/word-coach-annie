import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * 400 for a malformed request, else 413 for a size limit — the WCA-044 split.
 * A missing or invalid field outranks an oversized sibling, as the routes'
 * hand-written checks did before the Zod migration.
 */
export function validationErrorResponse(error: z.ZodError): NextResponse {
  const malformed = error.issues.find((issue) => issue.code !== "too_big");
  if (malformed) return NextResponse.json({ error: malformed.message }, { status: 400 });
  return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 413 });
}
