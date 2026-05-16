import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sanitizeInput, escapeMarkdown } from "@/lib/sanitize-server";

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

const MAX_FEEDBACK_MESSAGE_LENGTH = 10_000;
const MAX_EMAIL_LENGTH = 320; // RFC 5321 max
const MAX_SCREENSHOT_LENGTH = Math.ceil(2 * 1024 * 1024 * (4 / 3)); // 2 MB binary limit expressed as base64 length (~2,796,203 chars)

const LABEL_MAP: Record<string, string> = {
  bug: "bug",
  feature: "enhancement",
  other: "feedback",
};

/**
 * Upload a screenshot via GitHub's issue image upload endpoint.
 * Returns a markdown image URL (https://github.com/user-attachments/assets/...).
 * Only requires issues:write scope — no contents:write needed.
 */
async function uploadScreenshot(
  token: string,
  repo: string,
  dataUrl: string
): Promise<string | null> {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;

    // Enforce 2MB size limit before binary conversion
    const sizeInBytes = Math.ceil((base64.length * 3) / 4);
    if (sizeInBytes > 2 * 1024 * 1024) {
      logger.warn("Screenshot exceeds 2MB limit", { sizeInBytes });
      return null;
    }

    // Convert base64 to binary
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "image/jpeg" });

    const filename = `feedback-${Date.now()}.jpg`;
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("repository_id", await getRepoId(token, repo));
    formData.append("authenticity_token", token);

    // Use GitHub's issue image upload endpoint
    const res = await fetch(
      `https://uploads.github.com/repos/${repo}/issues/uploads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: formData,
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      logger.error("GitHub screenshot upload failed", { status: res.status, body: errText });
      return null;
    }

    const data = await res.json();
    // Response includes href with the permanent asset URL
    return data.href || data.asset?.href || null;
  } catch (err) {
    logger.error("Screenshot upload error", err);
    return null;
  }
}

async function getRepoId(token: string, repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  const data = await res.json();
  return String(data.id);
}

export async function POST(request: NextRequest) {
  const body: FeedbackBody = await request.json();

  if (!body.message?.trim()) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 }
    );
  }
  if (body.message.length > MAX_FEEDBACK_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message exceeds maximum length of ${MAX_FEEDBACK_MESSAGE_LENGTH} characters` },
      { status: 413 }
    );
  }
  if (body.email && body.email.length > MAX_EMAIL_LENGTH) {
    return NextResponse.json(
      { error: `Email exceeds maximum length of ${MAX_EMAIL_LENGTH} characters` },
      { status: 413 }
    );
  }
  if (body.screenshot && body.screenshot.length > MAX_SCREENSHOT_LENGTH) {
    return NextResponse.json(
      { error: "Screenshot exceeds maximum size of 2MB" },
      { status: 413 }
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

  // Sanitize and escape user-provided fields before embedding in GitHub Markdown
  const safeMessage = sanitizeInput(body.message.trim());
  const safeEmail = body.email ? escapeMarkdown(sanitizeInput(body.email)) : undefined;
  const safeUrl = body.context?.url ? escapeMarkdown(body.context.url) : undefined;
  const safeUserAgent = body.context?.userAgent ? escapeMarkdown(body.context.userAgent) : undefined;
  const safeScreenSize = body.context?.screenSize ? escapeMarkdown(body.context.screenSize) : undefined;

  // Build issue body with app context
  const contextLines: string[] = [];
  if (safeEmail) contextLines.push(`**Reporter:** ${safeEmail}`);
  if (safeUrl) contextLines.push(`**Page:** ${safeUrl}`);
  if (safeUserAgent)
    contextLines.push(`**Browser:** ${safeUserAgent}`);
  if (safeScreenSize)
    contextLines.push(`**Screen:** ${safeScreenSize}`);
  contextLines.push(`**App version:** ${process.env.npm_package_version || "unknown"}`);

  const bodyParts = [safeMessage];

  if (screenshotUrl) {
    bodyParts.push("", "### Screenshot", `![Screenshot](${screenshotUrl})`);
  }

  bodyParts.push("", "---", "### Context", ...contextLines);

  const issueBody = bodyParts.join("\n");

  const typePrefix =
    body.type === "bug" ? "Bug: " : body.type === "feature" ? "Feature: " : "";
  const titleSnippet = safeMessage.split("\n")[0].slice(0, 80);
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
