import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
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

function buildActorPrompt(manuscript: string): string {
  return `You are an acting coach reading this manuscript for emotional truth and earned feeling.
Background: You've coached actors and directors for 20 years. You can spot an unearned emotion from a mile away.
Review lens: Is each emotion justified by the setup that preceded it, or declared by the prose and expected to land on credit? Is the character's internal state legible — do readers know what the character is feeling and why, without being told directly? Are subtext and text working together or fighting each other? Do emotional peaks have enough runway? Are there places where the writing tells the reader to feel something rather than creating the conditions to feel it?

Be specific — quote the passage and explain exactly what's missing. A drama teacher who has seen every shortcut and won't let you take them.

Return ONLY valid JSON matching this schema (no markdown fences):
{"overallImpression":"...","strengths":["..."],"weaknesses":["..."],"detailedFeedback":"...","recommendation":"emotionally earned|mostly earned|needs more runway|emotionally hollow"}

MANUSCRIPT:
${manuscript}`;
}

function buildSynthesisPrompt(publisher: string, reader: string, writer: string, actor: string): string {
  return `Four reviewers just read the same manuscript. Here are their reviews:

PUBLISHER: ${publisher}
READER: ${reader}
WRITER: ${writer}
ACTING COACH: ${actor}

Synthesise a consensus. Identify what all four agree on, what they disagree on, and the top 3 revision priorities.

Return ONLY valid JSON (no markdown fences):
{"pointsOfAgreement":["..."],"pointsOfDisagreement":["..."],"topPriorities":["..."],"synthesizedRecommendation":"..."}`;
}

function parseJson<T>(raw: string): T | null {
  try {
    // Extract the first {...} block — handles cases where the model wraps JSON in markdown fences.
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

function parseOrLog<T>(raw: string, role: string, fallback: T): T {
  const parsed = parseJson<T>(raw);
  if (!parsed) logger.error(`Peer review: failed to parse ${role} JSON`, { raw: raw.slice(0, 300) });
  return parsed ?? fallback;
}

export const MANUSCRIPT_EMPTY = "Manuscript is empty";
export const AI_NOT_CONFIGURED = "AI not configured";

export async function runPeerReview(projectId: string, userId?: string | null) {
  const manuscript = await exportManuscript(projectId);
  if (!manuscript.trim()) {
    throw new Error(MANUSCRIPT_EMPTY);
  }

  const aiConfig = await getAiConfig(userId);
  if (!aiConfig.apiKey) {
    throw new Error(AI_NOT_CONFIGURED);
  }

  const truncated = manuscript.slice(0, 50000);

  const JSON_OPTS = { responseMimeType: "application/json", temperature: 0.3 } as const;

  const [publisherRaw, readerRaw, writerRaw, actorRaw] = await Promise.all([
    runSimpleCompletion({ userMessage: buildPublisherPrompt(truncated), aiConfig, maxTokens: 2000, ...JSON_OPTS }),
    runSimpleCompletion({ userMessage: buildReaderPrompt(truncated), aiConfig, maxTokens: 2000, ...JSON_OPTS }),
    runSimpleCompletion({ userMessage: buildWriterPrompt(truncated), aiConfig, maxTokens: 2000, ...JSON_OPTS }),
    runSimpleCompletion({ userMessage: buildActorPrompt(truncated), aiConfig, maxTokens: 2000, ...JSON_OPTS }),
  ]);

  const publisher = parseOrLog(publisherRaw, "publisher", DEFAULT_REVIEW);
  const reader = parseOrLog(readerRaw, "reader", DEFAULT_REVIEW);
  const writer = parseOrLog(writerRaw, "writer", DEFAULT_REVIEW);
  const actor = parseOrLog(actorRaw, "actor", DEFAULT_REVIEW);

  let consensus: ConsensusFeedback = DEFAULT_CONSENSUS;
  let consensusError: string | undefined;
  try {
    const synthesisRaw = await runSimpleCompletion({
      userMessage: buildSynthesisPrompt(publisherRaw, readerRaw, writerRaw, actorRaw),
      aiConfig,
      maxTokens: 2000,
      ...JSON_OPTS,
    });
    consensus = parseOrLog(synthesisRaw, "synthesis", DEFAULT_CONSENSUS);
  } catch (err) {
    logger.error("Peer review synthesis failed", err);
    consensusError = err instanceof Error ? err.message : String(err);
  }

  // DB failure intentionally propagates — the review results are not returned without persistence.
  const saved = await prisma.peerReview.create({
    data: {
      projectId,
      publisher: publisher as unknown as Prisma.InputJsonValue,
      reader: reader as unknown as Prisma.InputJsonValue,
      writer: writer as unknown as Prisma.InputJsonValue,
      actor: actor as unknown as Prisma.InputJsonValue,
      consensus: consensus as unknown as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      projectId: true,
      createdAt: true,
      publisher: true,
      reader: true,
      writer: true,
      actor: true,
      consensus: true,
    },
  });

  return { ...saved, ...(consensusError !== undefined && { consensusError }) };
}
