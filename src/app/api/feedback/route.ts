import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

interface FeedbackBody {
  type: "bug" | "feature" | "other";
  message: string;
  email?: string;
  /** Base64 data URL of the annotated screenshot (PNG). */
  screenshot?: string;
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

/** Max screenshot size: ~2 MB base64 string. */
const MAX_SCREENSHOT_LENGTH = 2_800_000;

/**
 * Upload screenshot as a repo asset via the GitHub Contents API and return
 * the raw URL. Falls back to inline base64 markdown if upload fails.
 */
async function uploadScreenshot(
  dataUrl: string,
  token: string,
  repo: string,
  issueTitle: string,
): Promise<string | null> {
  // Strip data URL prefix to get raw base64
  const base64Match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!base64Match) return null;

  const base64Content = base64Match[1];
  const timestamp = Date.now();
  const safeName = issueTitle
    .replace(/[^a-zA-Z0-9]/g, "-")
    .slice(0, 40)
    .toLowerCase();
  const path = `.github/feedback-screenshots/${safeName}-${timestamp}.png`;

  try {
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
          message: `Upload screenshot for feedback: ${issueTitle.slice(0, 60)}`,
          content: base64Content,
        }),
      },
    );

    if (res.ok) {
      const data: { content?: { download_url?: string } } = await res.json();
      return data.content?.download_url ?? null;
    }
  } catch (err: unknown) {
    logger.error("Screenshot upload failed", err);
  }

  return null;
}

export async function POST(request: NextRequest) {
  const body: FeedbackBody = await request.json();

  if (!body.message?.trim()) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 },
    );
  }

  if (!body.type || !["bug", "feature", "other"].includes(body.type)) {
    return NextResponse.json(
      { error: "Type must be one of: bug, feature, other" },
      { status: 400 },
    );
  }

  // Validate screenshot size if present
  if (body.screenshot && body.screenshot.length > MAX_SCREENSHOT_LENGTH) {
    return NextResponse.json(
      { error: "Screenshot is too large. Please try again with a smaller area." },
      { status: 413 },
    );
  }

  const token = env.GITHUB_FEEDBACK_TOKEN;
  const repo = env.GITHUB_FEEDBACK_REPO;

  if (!token || !repo) {
    return NextResponse.json(
      { error: "Feedback is not configured. Please set GITHUB_FEEDBACK_TOKEN and GITHUB_FEEDBACK_REPO." },
      { status: 503 },
    );
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

  const typePrefix =
    body.type === "bug" ? "Bug: " : body.type === "feature" ? "Feature: " : "";
  const titleSnippet = body.message.trim().split("\n")[0].slice(0, 80);
  const title = `${typePrefix}${titleSnippet}`;

  // Handle screenshot upload
  let screenshotMarkdown = "";
  if (body.screenshot) {
    const imageUrl = await uploadScreenshot(body.screenshot, token, repo, title);
    if (imageUrl) {
      screenshotMarkdown = `\n\n### Screenshot\n![Bug report screenshot](${imageUrl})`;
    } else {
      // Fallback: note that screenshot was provided but upload failed
      screenshotMarkdown = "\n\n### Screenshot\n_Screenshot was provided but could not be uploaded._";
    }
  }

  const issueBody = [
    body.message.trim(),
    "",
    "---",
    "### Context",
    ...contextLines,
  ].join("\n") + screenshotMarkdown;

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
      },
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      logger.error("GitHub API error", { status: res.status, ...errorData });
      return NextResponse.json(
        { error: "Failed to submit feedback. Please try again later." },
        { status: 502 },
      );
    }

    const issue: { html_url?: string } = await res.json();
    return NextResponse.json(
      { success: true, issueUrl: issue.html_url },
      { status: 201 },
    );
  } catch (err) {
    logger.error("Feedback submission error", err);
    return NextResponse.json(
      { error: "Failed to submit feedback. Please try again later." },
      { status: 502 },
    );
  }
}
