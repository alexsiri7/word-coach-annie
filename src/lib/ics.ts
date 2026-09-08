/**
 * Minimal iCalendar (RFC 5545) serialisation for the opportunity deadline feed.
 *
 * Deliberately no VALARM: Google Calendar discards alarms carried in a subscribed
 * feed, so reminder offsets are configured once by the author in their own client.
 */

const CRLF = "\r\n";
const MAX_OCTETS_PER_LINE = 75;

export type CalendarEvent = {
    uid: string;
    /** Last revision of the source record — DTSTAMP, so identical state renders identically. */
    stamp: Date;
    /** The day the event falls on; rendered as an all-day event. */
    date: Date;
    summary: string;
    description: string;
    url: string;
};

/** RFC 5545 §3.3.11 — backslash, semicolon, comma and newlines carry meaning in TEXT values. */
function escapeText(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * RFC 5545 §3.1 — content lines are folded at 75 octets and continued with a
 * leading space. Folding walks whole characters so a multi-byte one is never split.
 */
function foldLine(line: string): string {
    const parts: string[] = [];
    let current = "";
    let octets = 0;

    for (const char of line) {
        const size = Buffer.byteLength(char, "utf8");
        // Continuation lines spend one octet on their leading space.
        const limit = parts.length === 0 ? MAX_OCTETS_PER_LINE : MAX_OCTETS_PER_LINE - 1;
        if (octets + size > limit) {
            parts.push(current);
            current = "";
            octets = 0;
        }
        current += char;
        octets += size;
    }
    parts.push(current);

    return parts.join(CRLF + " ");
}

/** DATE value (YYYYMMDD) in UTC, so the day never shifts with the server's timezone. */
function toDateValue(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/** UTC DATE-TIME value (YYYYMMDDTHHMMSSZ). */
function toDateTimeValue(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function renderEvent(event: CalendarEvent): string[] {
    return [
        "BEGIN:VEVENT",
        `UID:${escapeText(event.uid)}`,
        `DTSTAMP:${toDateTimeValue(event.stamp)}`,
        `DTSTART;VALUE=DATE:${toDateValue(event.date)}`,
        // DTEND is exclusive, so a one-day event ends on the following date.
        `DTEND;VALUE=DATE:${toDateValue(new Date(event.date.getTime() + MS_PER_DAY))}`,
        `SUMMARY:${escapeText(event.summary)}`,
        // An event with nothing to add carries no DESCRIPTION rather than an empty one.
        ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
        // URI values are not backslash-escaped (RFC 5545 §3.3.13).
        `URL:${event.url}`,
        "END:VEVENT",
    ];
}

export function buildCalendar(name: string, events: CalendarEvent[]): string {
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Word Coach Annie//Opportunity deadlines//EN",
        "CALSCALE:GREGORIAN",
        `X-WR-CALNAME:${escapeText(name)}`,
        ...events.flatMap(renderEvent),
        "END:VCALENDAR",
    ];

    return lines.map(foldLine).join(CRLF) + CRLF;
}
