import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getCurrentUserId, verifyProjectWriteAccess } from "@/lib/api-auth";
import { getAiConfig } from "@/lib/ai/settings";
import { runSimpleCompletion } from "@/lib/ai/adk-agent";
import { exportManuscript } from "@/mcp/tools/export";

export interface ReviewFeedback {
  overallImpression: string;
  strengths: string[];
  weaknesses: string[];
  detailedFeedback: string;
  recommendation: string;
}

export interface ConsensusFeedback {
  pointsOfAgreement: string[];
  pointsOfDisagreement: string[];
  topPriorities: string[];
  synthesizedRecommendation: string;
}

function buildPublisherPrompt(manuscript: string): string {
  return `You are a seasoned acquisitions editor at a major publishing house with 15 years of experience.
Background: You evaluate manuscripts for commercial viability, market positioning, and editorial quality.
Daily reality: You read 50+ query letters weekly, acquire 8-12 books per year.
Pain points: Technically competent but commercially risky manuscripts; beautiful writing with no market.
Review lens: Market fit, hook strength, pacing for modern readers, series potential.

Review the following manuscript. Provide structured feedback covering commercial viability, hook and opening strength, pacing issues, character appeal, and what you would ask the author to revise.

Return ONLY valid JSON matching this schema (no markdown fences):
{"overallImpression":"...","strengths":["..."],"weaknesses":["..."],"detailedFeedback":"...","recommendation":"publish|revise|pass"}

MANUSCRIPT:
${manuscript}`;
}

function buildReaderPrompt(manuscript: string): string {
  return `You are an enthusiastic fiction reader who reads 4-5 books per month. You just finished this manuscript.
Background: You pick books based on cover and first page. You DNF anything that doesn't hook you by chapter 2.
Daily reality: You read on your commute and before bed. You recommend books to your book club.
Review lens: Did it hook you? Did you finish it? What stayed with you? What felt weak or confusing?

Review the following manuscript and provide your honest reader feedback.

Return ONLY valid JSON matching this schema (no markdown fences):
{"overallImpression":"...","strengths":["..."],"weaknesses":["..."],"detailedFeedback":"...","recommendation":"loved it|liked it|struggled|abandoned"}

MANUSCRIPT:
${manuscript}`;
}

function buildWriterPrompt(manuscript: string): string {
  return `You are a published novelist with an MFA and deep craft knowledge. You've taught creative writing for 10 years.
Background: You've sold 8 novels across literary and genre fiction. You mentor emerging writers.
Review lens: Voice consistency, pacing, character work, world-building integration, dialogue, ending.

Give craft feedback. Be specific about what works technically and what doesn't. Reference specific moments.

Return ONLY valid JSON matching this schema (no markdown fences):
{"overallImpression":"...","strengths":["..."],"weaknesses":["..."],"detailedFeedback":"...","recommendation":"strong|promising|needs work|major revision"}

MANUSCRIPT:
${manuscript}`;
}

function buildSynthesisPrompt(publisher: string, reader: string, writer: string): string {
  return `Three reviewers just read the same manuscript. Here are their reviews:

PUBLISHER: ${publisher}
READER: ${reader}
WRITER: ${writer}

Synthesise a consensus. Identify what all three agree on, what they disagree on, and the top 3 revision priorities.

Return ONLY valid JSON (no markdown fences):
{"pointsOfAgreement":["..."],"pointsOfDisagreement":["..."],"topPriorities":["..."],"synthesizedRecommendation":"..."}`;
}

function parseJson<T>(raw: string): T | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

const DEFAULT_REVIEW: ReviewFeedback = {
  overallImpression: "Unable to parse review",
  strengths: [],
  weaknesses: [],
  detailedFeedback: "",
  recommendation: "unknown",
};

const DEFAULT_CONSENSUS: ConsensusFeedback = {
  pointsOfAgreement: [],
  pointsOfDisagreement: [],
  topPriorities: [],
  synthesizedRecommendation: "Unable to synthesize consensus",
};

/**
 * POST /api/projects/[id]/peer-review
 *
 * Runs three parallel AI reviewer personas and synthesises a consensus.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const userId = getCurrentUserId(request);
  const access = await verifyProjectWriteAccess(projectId, userId, request.headers.get("x-user-email"));
  if (!access.authorized) return access.response;

  try {
    const aiConfig = await getAiConfig(userId);
    if (!aiConfig.apiKey) {
      return NextResponse.json({ warning: "AI not configured" });
    }

    const manuscript = await exportManuscript(projectId);
    if (!manuscript.trim()) {
      return NextResponse.json({ warning: "Manuscript is empty" });
    }

    const truncated = manuscript.slice(0, 50000);

    const [publisherRaw, readerRaw, writerRaw] = await Promise.all([
      runSimpleCompletion({ userMessage: buildPublisherPrompt(truncated), aiConfig, maxTokens: 800, temperature: 0.3 }),
      runSimpleCompletion({ userMessage: buildReaderPrompt(truncated), aiConfig, maxTokens: 800, temperature: 0.3 }),
      runSimpleCompletion({ userMessage: buildWriterPrompt(truncated), aiConfig, maxTokens: 800, temperature: 0.3 }),
    ]);

    const publisher = parseJson<ReviewFeedback>(publisherRaw) || DEFAULT_REVIEW;
    const reader = parseJson<ReviewFeedback>(readerRaw) || DEFAULT_REVIEW;
    const writer = parseJson<ReviewFeedback>(writerRaw) || DEFAULT_REVIEW;

    let consensus: ConsensusFeedback = DEFAULT_CONSENSUS;
    try {
      const synthesisRaw = await runSimpleCompletion({
        userMessage: buildSynthesisPrompt(publisherRaw, readerRaw, writerRaw),
        aiConfig,
        maxTokens: 600,
        temperature: 0.3,
      });
      consensus = parseJson<ConsensusFeedback>(synthesisRaw) || DEFAULT_CONSENSUS;
    } catch (err) {
      logger.error("Peer review synthesis failed", err);
    }

    return NextResponse.json({ publisher, reader, writer, consensus });
  } catch (error) {
    logger.error("POST /api/projects/[id]/peer-review error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
