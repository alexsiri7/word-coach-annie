import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sanitizeInput, escapeMarkdown } from "@/lib/sanitize-server";

const VALID_CATEGORIES = ["copyright", "illegal", "harassment", "other"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  copyright: "Copyright Infringement",
  illegal: "Illegal Content",
  harassment: "Harassment",
  other: "Other",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { category, details, url } = body;

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: "Category must be one of: copyright, illegal, harassment, other" },
      { status: 400 }
    );
  }

  // Verify the project exists (anyone can report, no auth required for read-accessible content)
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const token = env.GITHUB_FEEDBACK_TOKEN;
  const repo = env.GITHUB_FEEDBACK_REPO;

  if (!token || !repo) {
    return NextResponse.json(
      { error: "Content reporting is not configured." },
      { status: 503 }
    );
  }

  // Build GitHub issue — escape all user-controlled fields to prevent markdown injection
  const categoryLabel = CATEGORY_LABELS[category] || escapeMarkdown(category);
  const safeTitle = escapeMarkdown(project.title ?? "");
  let safeUrl = "";
  if (url && typeof url === "string") {
    try {
      const u = new URL(url);
      if (["http:", "https:"].includes(u.protocol)) safeUrl = escapeMarkdown(u.pathname);
    } catch { /* ignore invalid URLs */ }
  }
  const safeDetails = details?.trim() ? sanitizeInput(details.trim()).slice(0, 4000) : "";

  const title = `Content Report: ${categoryLabel} — "${safeTitle}"`;

  const bodyParts = [
    `### Content Report: ${categoryLabel}`,
    "",
    `**Project:** ${safeTitle} (ID: \`${project.id}\`)`,
  ];
  if (safeUrl) bodyParts.push(`**URL:** ${safeUrl}`);

  if (safeDetails) {
    bodyParts.push("", "### Details", safeDetails);
  }

  bodyParts.push(
    "",
    "---",
    "*This report was submitted via the reader view Report Content button.*"
  );

  const issueBody = bodyParts.join("\n");

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title,
        body: issueBody,
        labels: ["content-report"],
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      logger.error("GitHub API error creating content report", {
        status: res.status,
        ...errorData,
      });
      return NextResponse.json(
        { error: "Failed to submit report. Please try again later." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    logger.error("Content report submission error", err);
    return NextResponse.json(
      { error: "Failed to submit report. Please try again later." },
      { status: 502 }
    );
  }
}
