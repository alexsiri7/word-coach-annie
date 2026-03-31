import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

interface FeedbackBody {
  type: "bug" | "feature" | "other";
  message: string;
  email?: string;
  screenshot?: string; // data URL (image/jpeg;base64,...)
  context?: {
    url?: string;
    userAgent?: string;
    screenSize?: string;
  };
}

const LABEL_MAP: Record<string, string> = {
  bug: "bug",
  feature: "enhancement",
  other: "feedback",
};

/**
 * Upload a screenshot to the GitHub repo and return the raw URL.
 * Uses the Contents API to store images in .feedback-images/
 */
async function uploadScreenshot(
  token: string,
  repo: string,
  dataUrl: string
): Promise<string | null> {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;

    const filename = `feedback-${Date.now()}.jpg`;
    const path = `.feedback-images/${filename}`;

    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/${path}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          message: `feedback: screenshot attachment`,
          content: base64,
        }),
      }
    );

    if (!res.ok) {
      logger.error("GitHub screenshot upload failed", { status: res.status });
      return null;
    }

    const data = await res.json();
    return data.content?.download_url || null;
  } catch (err) {
    logger.error("Screenshot upload error", err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body: FeedbackBody = await request.json();

  if (!body.message?.trim()) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 }
    );
  }

  if (!body.type || !["bug", "feature", "other"].includes(body.type)) {
    return NextResponse.json(
      { error: "Type must be one of: bug, feature, other" },
      { status: 400 }
    );
  }

  const token = env.GITHUB_FEEDBACK_TOKEN;
  const repo = env.GITHUB_FEEDBACK_REPO;

  if (!token || !repo) {
    return NextResponse.json(
      { error: "Feedback is not configured. Please set GITHUB_FEEDBACK_TOKEN and GITHUB_FEEDBACK_REPO." },
      { status: 503 }
    );
  }

  // Upload screenshot if provided
  let screenshotUrl: string | null = null;
  if (body.screenshot) {
    screenshotUrl = await uploadScreenshot(token, repo, body.screenshot);
  }

  // Build issue body with app context
  const contextLines: string[] = [];
  if (body.email) contextLines.push(`**Reporter:** ${body.email}`);
  if (body.context?.url) contextLines.push(`**Page:** ${body.context.url}`);
  if (body.context?.userAgent)
    contextLines.push(`**Browser:** ${body.context.userAgent}`);
  if (body.context?.screenSize)
    contextLines.push(`**Screen:** ${body.context.screenSize}`);
  contextLines.push(`**App version:** ${process.env.npm_package_version || "unknown"}`);

  const bodyParts = [body.message.trim()];

  if (screenshotUrl) {
    bodyParts.push("", "### Screenshot", `![Screenshot](${screenshotUrl})`);
  }

  bodyParts.push("", "---", "### Context", ...contextLines);

  const issueBody = bodyParts.join("\n");

  const typePrefix =
    body.type === "bug" ? "Bug: " : body.type === "feature" ? "Feature: " : "";
  const titleSnippet = body.message.trim().split("\n")[0].slice(0, 80);
  const title = `${typePrefix}${titleSnippet}`;

  const labels = [LABEL_MAP[body.type] || "feedback"];

  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ title, body: issueBody, labels }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      logger.error("GitHub API error", { status: res.status, ...errorData });
      return NextResponse.json(
        { error: "Failed to submit feedback. Please try again later." },
        { status: 502 }
      );
    }

    const issue = await res.json();
    return NextResponse.json(
      { success: true, issueUrl: issue.html_url },
      { status: 201 }
    );
  } catch (err) {
    logger.error("Feedback submission error", err);
    return NextResponse.json(
      { error: "Failed to submit feedback. Please try again later." },
      { status: 502 }
    );
  }
}
