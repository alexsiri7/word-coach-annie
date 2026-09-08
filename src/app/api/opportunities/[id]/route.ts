import { NextRequest, NextResponse } from "next/server";
import { OpportunityController } from "@/lib/controllers/opportunities";
import { OpportunityUpdateSchema } from "@/schemas/opportunities";
import { getCurrentUserId } from "@/lib/api-auth";
import { sanitizeInput } from "@/lib/sanitize-server";
import { opportunityErrorResponse } from "../errors";

/** Free-text fields are stripped of markup; `null` stays null (it clears the field). */
function sanitizeOptional(value: string | null | undefined): string | null | undefined {
    return typeof value === "string" ? sanitizeInput(value) : value;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const opportunity = await OpportunityController.getOpportunity(id, userId);
        return NextResponse.json(opportunity);
    } catch (error) {
        return opportunityErrorResponse("GET /api/opportunities/[id]", error);
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json().catch(() => null);
        if (body === null) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const parsed = OpportunityUpdateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
        }
        if (Object.keys(parsed.data).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const { id } = await params;
        const opportunity = await OpportunityController.updateOpportunity(id, userId, {
            ...parsed.data,
            title: parsed.data.title !== undefined ? sanitizeInput(parsed.data.title) : undefined,
            rulesUrl: sanitizeOptional(parsed.data.rulesUrl),
            entryFee: sanitizeOptional(parsed.data.entryFee),
            genreRestrictions: sanitizeOptional(parsed.data.genreRestrictions),
            eligibilityNotes: sanitizeOptional(parsed.data.eligibilityNotes),
        });

        return NextResponse.json(opportunity);
    } catch (error) {
        return opportunityErrorResponse("PATCH /api/opportunities/[id]", error);
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const userId = getCurrentUserId(request);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { id } = await params;
        const result = await OpportunityController.deleteOpportunity(id, userId);
        return NextResponse.json(result);
    } catch (error) {
        return opportunityErrorResponse("DELETE /api/opportunities/[id]", error);
    }
}
