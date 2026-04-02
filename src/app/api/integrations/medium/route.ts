import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE() {
  await prisma.mediumCredential.deleteMany();
  return NextResponse.json({ disconnected: true });
}
