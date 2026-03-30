"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { ReactRenderer } from "@tiptap/react";
import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { StoryObject } from "@/lib/types";
import { cn } from "@/lib/utils";

const GROUP_ORDER = ["CHARACTER", "LOCATION", "PLOTLINE"];
const GROUP_LABELS: Record<string, string> = {
  CHARACTER: "Characters",
  LOCATION: "Locations",
  PLOTLINE: "Plotlines",
};

interface MentionItem {
  id: string;
  label: string;
  type: string;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

interface MentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }: { event: KeyboardEvent }) {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => Math.max(0, i - 1));
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
          return true;
        }
        if (event.key === "Enter") {
          const item = items[selectedIndex];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="bg-surface-raised border border-border rounded-lg shadow-lg p-2 text-xs text-text-muted">
          No results
        </div>
      );
    }

    const grouped: Record<string, MentionItem[]> = {};
    for (const item of items) {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    }

    let flatIndex = 0;
    return (
      <div className="bg-surface-raised border border-border rounded-lg shadow-lg py-1 min-w-40 max-w-60 max-h-64 overflow-y-auto z-50">
        {GROUP_ORDER.filter((g) => grouped[g]?.length).map((group) => (
          <div key={group}>
            <div className="px-3 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider">
              {GROUP_LABELS[group]}
            </div>
            {grouped[group].map((item) => {
              const idx = flatIndex++;
              return (
                <button
                  key={item.id}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm transition-colors",
                    idx === selectedIndex
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-surface-overlay/60"
                  )}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => command(item)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
);
MentionList.displayName = "MentionList";

export function buildMentionExtension(
  getStoryObjects: () => StoryObject[],
  onMentionInserted?: (objectId: string, objectType: string) => void
) {
  const suggestion: Partial<SuggestionOptions<MentionItem>> = {
    items({ query }: { query: string }) {
      const q = query.toLowerCase();
      return getStoryObjects()
        .filter(
          (o) =>
            ["CHARACTER", "LOCATION", "PLOTLINE"].includes(o.type) &&
            o.name.toLowerCase().includes(q)
        )
        .slice(0, 20)
        .map((o) => ({ id: o.id, label: o.name, type: o.type }));
    },

    command({ editor, range, props }) {
      const item = props as MentionItem;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "mention",
          attrs: { id: item.id, label: item.label, type: item.type },
        })
        .insertContent(" ")
        .run();

      if (onMentionInserted) {
        onMentionInserted(item.id, item.type);
      }
    },

    render() {
      let component: ReactRenderer<MentionListRef, MentionListProps>;
      let wrapper: HTMLDivElement;

      const updatePosition = (clientRect: (() => DOMRect | null) | null) => {
        if (!clientRect || !wrapper) return;
        const rect = clientRect();
        if (!rect) return;
        wrapper.style.top = `${rect.bottom + window.scrollY + 4}px`;
        wrapper.style.left = `${rect.left + window.scrollX}px`;
      };

      return {
        onStart(props) {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });

          wrapper = document.createElement("div");
          wrapper.style.position = "absolute";
          wrapper.style.zIndex = "9999";
          wrapper.appendChild(component.element);
          document.body.appendChild(wrapper);
          updatePosition(props.clientRect ?? null);
        },

        onUpdate(props) {
          component.updateProps(props);
          updatePosition(props.clientRect ?? null);
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            wrapper.remove();
            return true;
          }
          return component.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          wrapper.remove();
          component.destroy();
        },
      };
    },
  };

  return Mention.configure({
    HTMLAttributes: {
      class:
        "mention bg-accent/10 text-accent rounded px-0.5 font-medium cursor-pointer hover:bg-accent/20 transition-colors",
    },
    suggestion,
    renderText({ node }) {
      return `@${node.attrs.label ?? node.attrs.id}`;
    },
    renderHTML({ options, node }) {
      return [
        "span",
        {
          ...options.HTMLAttributes,
          "data-mention-id": node.attrs.id,
          "data-mention-type": node.attrs.type,
        },
        `@${node.attrs.label ?? node.attrs.id}`,
      ];
    },
  }).extend({
    addAttributes() {
      return {
        id: { default: null },
        label: { default: null },
        type: { default: null },
        mentionSuggestionChar: { default: "@" },
      };
    },
  });
}
