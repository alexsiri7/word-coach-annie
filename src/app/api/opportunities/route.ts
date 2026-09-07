import { NextRequest, NextResponse } from "next/server";
import { OpportunityController } from "@/lib/controllers/opportunities";
import { OpportunityCreateSchema } from "@/schemas/opportunities";
import { getCurrentUserId } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { opportunityErrorResponse } from "./errors";

export async function GET(request: NextRequest) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const result = await OpportunityController.listOpportunities(userId);
        return NextResponse.json(result);
    } catch (error) {
        return opportunityErrorResponse("GET /api/opportunities", error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => null);
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = OpportunityCreateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }

        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const opportunity = await OpportunityController.createOpportunity({
            ...parsed.data,
            userId,
            title: sanitizeInput(parsed.data.title),
            rulesUrl: parsed.data.rulesUrl ? sanitizeInput(parsed.data.rulesUrl) : undefined,
            entryFee: parsed.data.entryFee ? sanitizeInput(parsed.data.entryFee) : undefined,
            genreRestrictions: parsed.data.genreRestrictions
                ? sanitizeInput(parsed.data.genreRestrictions)
                : undefined,
            eligibilityNotes: parsed.data.eligibilityNotes
                ? sanitizeInput(parsed.data.eligibilityNotes)
                : undefined,
        });

        return NextResponse.json(opportunity, { status: 201 });
    } catch (error) {
        return opportunityErrorResponse("POST /api/opportunities", error);
    }
}
