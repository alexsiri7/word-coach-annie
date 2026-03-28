"use client";

import { Mention } from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type { StoryObject, StoryObjectType } from "@/lib/types";

// Groups for the dropdown
const TYPE_ORDER: StoryObjectType[] = ["CHARACTER", "LOCATION", "PLOTLINE"];
const TYPE_LABELS: Record<StoryObjectType, string> = {
  CHARACTER: "Characters",
  LOCATION: "Locations",
  PLOTLINE: "Plotlines",
  WORLD_ELEMENT: "World",
  NOTE: "Notes",
};

export interface MentionItem {
  id: string;
  name: string;
  type: StoryObjectType;
}

// Simple dropdown component rendered into a floating div
function MentionListComponent({
  items,
  command,
  onDismiss,
}: {
  items: MentionItem[];
  command: (item: MentionItem) => void;
  onDismiss: () => void;
}) {
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    items: items.filter((i) => i.type === type),
  })).filter((g) => g.items.length > 0);

  if (grouped.length === 0) {
    return (
      <div className="mention-dropdown-empty">No matches</div>
    );
  }

  return (
    <div className="mention-dropdown" onMouseDown={(e) => e.preventDefault()}>
      {grouped.map(({ type, label, items: groupItems }) => (
        <div key={type}>
          <div className="mention-dropdown-group-label">{label}</div>
          {groupItems.map((item) => (
            <button
              key={item.id}
              className="mention-dropdown-item"
              onMouseDown={(e) => {
                e.preventDefault();
                command(item);
                onDismiss();
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function buildMentionExtension(
  storyObjects: StoryObject[],
  onMentionInserted: (objectId: string) => void
) {
  const allItems: MentionItem[] = storyObjects
    .filter((o) => TYPE_ORDER.includes(o.type as StoryObjectType))
    .map((o) => ({ id: o.id, name: o.name, type: o.type as StoryObjectType }));

  // We'll hold a ref to the renderer so we can update/destroy it
  let renderer: ReactRenderer | null = null;
  let floatingEl: HTMLElement | null = null;

  const suggestion: Omit<SuggestionOptions<MentionItem>, "editor"> = {
    char: "@",
    items: ({ query }: { query: string }) => {
      if (!query) return allItems.slice(0, 20);
      const q = query.toLowerCase();
      return allItems.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 20);
    },

    render() {
      return {
        onStart({ items, clientRect, command }: { items: MentionItem[]; clientRect?: (() => DOMRect | null) | null; command: (item: MentionItem) => void }) {
          floatingEl = document.createElement("div");
          floatingEl.style.position = "fixed";
          floatingEl.style.zIndex = "9999";
          document.body.appendChild(floatingEl);

          const dismiss = () => {
            renderer?.destroy();
            renderer = null;
            floatingEl?.remove();
            floatingEl = null;
          };

          renderer = new ReactRenderer(MentionListComponent, {
            editor: {} as Editor,
            props: { items, command: (item: MentionItem) => { command(item); }, onDismiss: dismiss },
          });

          floatingEl.appendChild(renderer.element);

          // Position near cursor
          if (clientRect) {
            const rect = clientRect();
            if (rect) {
              floatingEl.style.top = `${rect.bottom + 4}px`;
              floatingEl.style.left = `${rect.left}px`;
            }
          }
        },

        onUpdate({ items, clientRect, command }: { items: MentionItem[]; clientRect?: (() => DOMRect | null) | null; command: (item: MentionItem) => void }) {
          if (!renderer) return;

          const dismiss = () => {
            renderer?.destroy();
            renderer = null;
            floatingEl?.remove();
            floatingEl = null;
          };

          renderer.updateProps({ items, command: (item: MentionItem) => { command(item); }, onDismiss: dismiss });

          if (clientRect && floatingEl) {
            const rect = clientRect();
            if (rect) {
              floatingEl.style.top = `${rect.bottom + 4}px`;
              floatingEl.style.left = `${rect.left}px`;
            }
          }
        },

        onKeyDown({ event }: { event: KeyboardEvent }) {
          if (event.key === "Escape") {
            renderer?.destroy();
            renderer = null;
            floatingEl?.remove();
            floatingEl = null;
            return true;
          }
          return false;
        },

        onExit() {
          renderer?.destroy();
          renderer = null;
          floatingEl?.remove();
          floatingEl = null;
        },
      };
    },

    command({ editor, range, props }: { editor: Editor; range: { from: number; to: number }; props: MentionItem }) {
      // Insert the mention node
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "mention",
            attrs: { id: props.id, label: props.name },
          },
          { type: "text", text: " " },
        ])
        .run();

      // Notify parent to create relationship
      onMentionInserted(props.id);
    },
  };

  return Mention.configure({
    HTMLAttributes: {
      class:
        "mention-inline",
    },
    renderHTML({ node }) {
      return [
        "span",
        {
          "data-type": "mention",
          "data-id": node.attrs.id,
          "data-label": node.attrs.label,
          class: "mention-inline",
        },
        `@${node.attrs.label ?? node.attrs.id}`,
      ];
    },
    renderText({ node }) {
      return `@${node.attrs.label ?? node.attrs.id}`;
    },
    suggestion,
  });
}
