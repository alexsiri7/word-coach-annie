import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const cred = await prisma.mediumCredential.findFirst();
  if (!cred) {
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({
    connected: true,
    username: cred.username,
    authorId: cred.authorId,
  });
}
