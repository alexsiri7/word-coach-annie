import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  const { token } = await req.json();

  if (!token || typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "Integration token is required" }, { status: 400 });
  }

  // Verify the token with Medium API
  let authorId: string;
  let username: string;
  try {
    const res = await fetch("https://api.medium.com/v1/me", {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[medium/connect] Medium API error:", res.status, body);
      return NextResponse.json(
        { error: "Invalid integration token. Please check your Medium settings." },
        { status: 400 }
      );
    }
    const data = await res.json();
    authorId = data.data?.id;
    username = data.data?.username;
    if (!authorId || !username) {
      return NextResponse.json({ error: "Could not retrieve Medium account details." }, { status: 400 });
    }
  } catch (err) {
    console.error("[medium/connect] fetch error:", err);
    return NextResponse.json({ error: "Failed to reach Medium API." }, { status: 502 });
  }

  // Store (replace any existing credential)
  await prisma.mediumCredential.deleteMany();
  await prisma.mediumCredential.create({
    data: {
      integrationToken: encrypt(token.trim()),
      authorId,
      username,
    },
  });

  return NextResponse.json({ connected: true, username, authorId });
}
