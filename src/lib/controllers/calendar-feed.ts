import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { buildCalendar, type CalendarEvent } from "@/lib/ics";
import { NotFoundError } from "@/lib/controllers/opportunities";

export const CALENDAR_NAME = "Annie — submission deadlines";

/** 256 bits: the URL is the only credential a calendar client can present. */
function newToken(): string {
    return randomBytes(32).toString("base64url");
}

export function feedPath(token: string): string {
    return `/api/calendar/opportunities/${token}.ics`;
}

type FeedOpportunity = {
    id: string;
    title: string;
    closeDate: Date;
    updatedAt: Date;
    rulesUrl: string | null;
    entryFee: string | null;
    wordLimit: number | null;
    lineLimit: number | null;
    genreRestrictions: string | null;
    provider: { name: string };
};

/** Self-contained enough that the reminder answers "what does this entry need?" on its own. */
function describe(opportunity: FeedOpportunity): string {
    const lines: string[] = [];
    if (opportunity.rulesUrl) lines.push(`Rules: ${opportunity.rulesUrl}`);
    if (opportunity.entryFee) lines.push(`Entry fee: ${opportunity.entryFee}`);
    if (opportunity.wordLimit !== null) lines.push(`Word limit: ${opportunity.wordLimit}`);
    if (opportunity.lineLimit !== null) lines.push(`Line limit: ${opportunity.lineLimit}`);
    if (opportunity.genreRestrictions) lines.push(`Genres: ${opportunity.genreRestrictions}`);
    return lines.join("\n");
}

function toEvent(opportunity: FeedOpportunity, origin: string): CalendarEvent {
    return {
        // Derived from the opportunity id, so an edited close date moves this event
        // instead of leaving a duplicate behind.
        uid: `opportunity-${opportunity.id}@word-coach-annie`,
        stamp: opportunity.updatedAt,
        date: opportunity.closeDate,
        summary: `${opportunity.title} — ${opportunity.provider.name}`,
        description: describe(opportunity),
        url: `${origin}/opportunity/${opportunity.id}`,
    };
}

export class CalendarFeedController {
    /**
     * The token is minted on first read rather than at signup, so accounts created
     * before the feed existed get one the moment they open Settings.
     */
    static async getOrCreateToken(userId: string): Promise<string> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { calendarFeedToken: true },
        });
        if (!user) throw new NotFoundError(`User not found: ${userId}`);
        if (user.calendarFeedToken) return user.calendarFeedToken;

        return CalendarFeedController.regenerateToken(userId);
    }

    /** Regenerating invalidates the previous URL — subscriptions using it stop resolving. */
    static async regenerateToken(userId: string): Promise<string> {
        const calendarFeedToken = newToken();
        await prisma.user.update({ where: { id: userId }, data: { calendarFeedToken } });
        return calendarFeedToken;
    }

    /**
     * Renders the current state of every opportunity that is not closed. Nothing is
     * stored, so a closed or deleted opportunity simply stops appearing on the next refresh.
     * Returns null when no account owns the token.
     */
    static async renderOpportunityFeed(token: string, origin: string): Promise<string | null> {
        const user = await prisma.user.findUnique({
            where: { calendarFeedToken: token },
            select: { id: true },
        });
        if (!user) return null;

        const opportunities = await prisma.opportunity.findMany({
            where: { userId: user.id, status: { not: "closed" } },
            orderBy: { closeDate: "asc" },
            include: { provider: { select: { name: true } } },
        });

        return buildCalendar(
            CALENDAR_NAME,
            opportunities.map((opportunity) => toEvent(opportunity, origin))
        );
    }
}
