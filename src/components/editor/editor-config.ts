import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { BeatAnnotation } from "@/components/editor/extensions/beat";

// Custom Highlight extension to support IDs
export const AnnotationMark = Highlight.extend({
  name: "annotation",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-annotation-id"),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {};
          }
          return {
            "data-annotation-id": attributes.id,
            class:
              "bg-yellow-200 dark:bg-yellow-900/50 border-b-2 border-yellow-500 cursor-pointer",
          };
        },
      },
    };
  },
});

export function getEditorExtensions() {
  return [
    StarterKit,
    Underline,
    AnnotationMark.configure({
      HTMLAttributes: {
        class:
          "bg-yellow-200 dark:bg-yellow-900/50 border-b-2 border-yellow-500 cursor-pointer",
      },
    }),
    Placeholder.configure({
      placeholder: "Start writing your scene...",
    }),
    BeatAnnotation,
  ];
}

// Helper to convert HTML comments to beat nodes for Tiptap
export const commentsToBeats = (html: string) => {
  return html.replace(/<!-- beat: ([\s\S]*?) -->/g, (_match, content) => {
    return `<div data-type="beat-annotation">${content}</div>`;
  });
};

// Helper to convert beat nodes back to HTML comments for storage
export const beatsToComments = (html: string) => {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const beats = doc.querySelectorAll('div[data-type="beat-annotation"]');

  beats.forEach((beat) => {
    const content = beat.textContent || "";
    const comment = doc.createComment(` beat: ${content} `);
    beat.replaceWith(comment);
  });

  return doc.body.innerHTML;
};

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
