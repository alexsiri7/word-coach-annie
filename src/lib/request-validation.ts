import { NextResponse } from "next/server";
import type { z } from "zod";

/** 413 when any field exceeds its size limit, else 400 — the WCA-044 split. */
export function validationErrorResponse(error: z.ZodError): NextResponse {
  const tooBig = error.issues.find((issue) => issue.code === "too_big");
  if (tooBig) return NextResponse.json({ error: tooBig.message }, { status: 413 });
  return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
}
