import { describe, it, expect } from "vitest";
import { safeHref } from "@/lib/http-url";
import { HttpUrl } from "@/schemas/http-url";
import { OpportunityCreateSchema, OpportunityUpdateSchema } from "@/schemas/opportunities";
import {
    ContestSubmissionCreateSchema,
    ContestSubmissionUpdateSchema,
    ProviderCreateSchema,
    ProviderUpdateSchema,
} from "@/schemas/submissions";

const UNSAFE = [
    "javascript:alert(1)",
    " JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "/relative/path",
    "example.com/rules",
    "",
];

describe("HttpUrl", () => {
    it.each(["https://example.com/rules", "http://example.com"])("accepts %s", (url) => {
        expect(HttpUrl.safeParse(url).success).toBe(true);
    });

    it.each(UNSAFE)("rejects %j", (url) => {
        expect(HttpUrl.safeParse(url).success).toBe(false);
    });
});

describe("URL fields that are stored and shown as links", () => {
    const opportunity = { providerId: "p", title: "Prize", closeDate: "2030-04-01T00:00:00.000Z" };
    const contest = { providerId: "p", contestName: "Prize", submissionDate: "2030-04-01T00:00:00.000Z" };
    const cases = [
        { name: "opportunity create rulesUrl", schema: OpportunityCreateSchema, base: opportunity, field: "rulesUrl" },
        { name: "opportunity update rulesUrl", schema: OpportunityUpdateSchema, base: {}, field: "rulesUrl" },
        { name: "provider create website", schema: ProviderCreateSchema, base: { name: "Org" }, field: "website" },
        { name: "provider update website", schema: ProviderUpdateSchema, base: {}, field: "website" },
        { name: "contest create submissionUrl", schema: ContestSubmissionCreateSchema, base: contest, field: "submissionUrl" },
        { name: "contest update submissionUrl", schema: ContestSubmissionUpdateSchema, base: {}, field: "submissionUrl" },
    ];

    it.each(cases)("$name accepts https", ({ schema, base, field }) => {
        expect(schema.safeParse({ ...base, [field]: "https://example.com/rules" }).success).toBe(true);
    });

    it.each(cases)("$name rejects javascript: and data:", ({ schema, base, field }) => {
        expect(schema.safeParse({ ...base, [field]: "javascript:alert(1)" }).success).toBe(false);
        expect(schema.safeParse({ ...base, [field]: "data:text/html,hi" }).success).toBe(false);
    });

    it("still lets an opportunity update clear rulesUrl with null", () => {
        expect(OpportunityUpdateSchema.safeParse({ rulesUrl: null }).success).toBe(true);
    });
});

describe("safeHref", () => {
    it("passes an http(s) URL through unchanged", () => {
        expect(safeHref("https://example.com/rules?a=1")).toBe("https://example.com/rules?a=1");
    });

    it.each(UNSAFE)("yields no href for %j", (url) => {
        expect(safeHref(url)).toBeUndefined();
    });

    it("yields no href for a missing value", () => {
        expect(safeHref(null)).toBeUndefined();
        expect(safeHref(undefined)).toBeUndefined();
    });
});
