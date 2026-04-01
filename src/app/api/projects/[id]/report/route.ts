import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

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
    select: { id: true, title: true, author: true },
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

  // Get reporter identity if available
  const reporterEmail = request.headers.get("x-user-email");
  const reporterId = request.headers.get("x-user-id");

  // Build GitHub issue
  const categoryLabel = CATEGORY_LABELS[category] || category;
  const title = `Content Report: ${categoryLabel} — "${project.title}"`;

  const bodyParts = [
    `### Content Report: ${categoryLabel}`,
    "",
    `**Project:** ${project.title} (ID: \`${project.id}\`)`,
  ];
  if (project.author) bodyParts.push(`**Author:** ${project.author}`);
  if (url) bodyParts.push(`**URL:** ${url}`);
  if (reporterEmail) bodyParts.push(`**Reporter:** ${reporterEmail}`);
  else if (reporterId) bodyParts.push(`**Reporter ID:** ${reporterId}`);

  if (details?.trim()) {
    bodyParts.push("", "### Details", details.trim());
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
