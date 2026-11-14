/**
 * Location slugs exactly as the story-sync export writes its `location/<slug>.md`
 * files (alexsiri7/interstellarai.net ops/cron/lib/annie_export.py: `slug()` and the
 * dedup loop over objects sorted by name). The game's snapshot job names locations by
 * these slugs, so a change there must be mirrored here.
 */

export function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

/** Python compares strings by code point; JS `<` compares UTF-16 units, which orders astral characters differently. */
export function compareCodePoints(a: string, b: string): number {
    const x = Array.from(a, (c) => c.codePointAt(0)!);
    const y = Array.from(b, (c) => c.codePointAt(0)!);
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        if (x[i] !== y[i]) return x[i] - y[i];
    }
    return x.length - y.length;
}

/** Slug → location id; a repeated slug gets `-2`, `-3`, … in name-then-id order. */
export function locationSlugs(locations: { id: string; name: string }[]): Map<string, string> {
    const sorted = [...locations].sort(
        (a, b) => compareCodePoints(a.name.toLowerCase(), b.name.toLowerCase()) || compareCodePoints(a.id, b.id),
    );
    const slugs = new Map<string, string>();
    for (const location of sorted) {
        const base = slugify(location.name);
        let slug = base;
        for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
        slugs.set(slug, location.id);
    }
    return slugs;
}
