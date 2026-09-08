import { describe, it, expect } from "vitest";
import { buildCalendar, type CalendarEvent } from "@/lib/ics";

const STAMP = new Date("2026-03-01T10:30:00.000Z");

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
        uid: "opportunity-abc@word-coach-annie",
        stamp: STAMP,
        date: new Date("2026-04-01T00:00:00.000Z"),
        summary: "Spring Prize",
        description: "Rules: https://example.com/rules",
        url: "https://annie.test/opportunity/abc",
        ...overrides,
    };
}

/** Unfolds RFC 5545 continuation lines so assertions can look at logical content lines. */
function contentLines(ics: string): string[] {
    return ics.split("\r\n").reduce<string[]>((lines, line) => {
        if (line.startsWith(" ") && lines.length > 0) {
            lines[lines.length - 1] += line.slice(1);
            return lines;
        }
        if (line !== "") lines.push(line);
        return lines;
    }, []);
}

describe("buildCalendar", () => {
    it("wraps events in a VCALENDAR with CRLF line endings", () => {
        const ics = buildCalendar("Deadlines", [event()]);

        expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
        expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
        expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
        expect(contentLines(ics)).toEqual(
            expect.arrayContaining(["VERSION:2.0", "PRODID:-//Word Coach Annie//Opportunity deadlines//EN"])
        );
    });

    it("renders an all-day event whose DTEND is the following date", () => {
        const lines = contentLines(buildCalendar("Deadlines", [event()]));

        expect(lines).toEqual(
            expect.arrayContaining([
                "DTSTART;VALUE=DATE:20260401",
                "DTEND;VALUE=DATE:20260402",
                "DTSTAMP:20260301T103000Z",
                "UID:opportunity-abc@word-coach-annie",
            ])
        );
    });

    it("keeps the date in UTC rather than the server's timezone", () => {
        // 23:30Z on the 1st is already the 2nd in Sydney and still the 1st in New York.
        const lines = contentLines(
            buildCalendar("Deadlines", [event({ date: new Date("2026-04-01T23:30:00.000Z") })])
        );

        expect(lines).toContain("DTSTART;VALUE=DATE:20260401");
        expect(lines).toContain("DTEND;VALUE=DATE:20260402");
    });

    it("escapes the characters that carry meaning in TEXT values", () => {
        const lines = contentLines(
            buildCalendar("Deadlines", [
                event({ summary: "Prize; short, sharp\\odd", description: "First line\nSecond line" }),
            ])
        );

        expect(lines).toContain("SUMMARY:Prize\\; short\\, sharp\\\\odd");
        expect(lines).toContain("DESCRIPTION:First line\\nSecond line");
    });

    it("folds long lines at 75 octets with a leading-space continuation", () => {
        const description = "Rules: https://example.com/a-very-long-path-that-keeps-going-and-going/rules";
        const ics = buildCalendar("Deadlines", [event({ description })]);

        for (const line of ics.split("\r\n")) {
            expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
        }
        expect(ics).toContain("\r\n ");
        expect(contentLines(ics)).toContain(`DESCRIPTION:${description}`);
    });

    it("never splits a multi-byte character across a fold", () => {
        const ics = buildCalendar("Deadlines", [event({ description: "é".repeat(60) })]);

        expect(contentLines(ics)).toContain(`DESCRIPTION:${"é".repeat(60)}`);
        expect(ics).not.toContain("�");
    });

    it("omits DESCRIPTION when the event has nothing to add", () => {
        const lines = contentLines(buildCalendar("Deadlines", [event({ description: "" })]));

        expect(lines.some((line) => line.startsWith("DESCRIPTION"))).toBe(false);
    });

    it("leaves the URL unescaped — URI values are not TEXT (RFC 5545 §3.3.13)", () => {
        const url = "https://annie.test/opportunity/abc?a=1,2;3";
        const lines = contentLines(buildCalendar("Deadlines", [event({ url })]));

        expect(lines).toContain(`URL:${url}`);
    });

    it("emits no VALARM — subscribed feeds cannot carry reminders reliably", () => {
        expect(buildCalendar("Deadlines", [event()])).not.toContain("VALARM");
    });

    it("renders an empty calendar when there is nothing to publish", () => {
        expect(contentLines(buildCalendar("Deadlines", []))).not.toContain("BEGIN:VEVENT");
    });
});
