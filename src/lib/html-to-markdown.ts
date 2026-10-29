import { decodeHtmlEntities, stripBeats } from "@/lib/scene-text";

export interface MarkdownOptions {
    includeBeats?: boolean;
}

export function htmlToMarkdown(html: string, options: MarkdownOptions = {}): string {
    if (!html || html === "<p></p>") return "";

    let md = html;

    if (!options.includeBeats) {
        md = stripBeats(md);
    }

    md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
    md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
    md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
    md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
    md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");
    md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
    md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");
    md = md.replace(/<u>(.*?)<\/u>/gi, "$1");
    md = md.replace(/<ul[^>]*>/gi, "");
    md = md.replace(/<\/ul>/gi, "\n");
    md = md.replace(/<ol[^>]*>/gi, "");
    md = md.replace(/<\/ol>/gi, "\n");
    md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
    md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
    md = md.replace(/<br\s*\/?>/gi, "\n");
    md = md.replace(/<[^>]+>/g, "");
    md = md.replace(/\n{3,}/g, "\n\n");
    md = decodeHtmlEntities(md);

    return md.trim();
}
