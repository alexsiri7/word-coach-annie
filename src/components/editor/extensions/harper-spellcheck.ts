import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DecorationSet, Decoration } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import type { Linter } from "harper.js";

export interface LintResult {
  id: string;
  from: number;
  to: number;
  message: string;
  suggestions: string[];
}

export interface SuggestionOpenPayload {
  lint: LintResult;
  rect: DOMRect;
}

interface HarperPluginState {
  decorations: DecorationSet;
  lints: LintResult[];
}

const harperPluginKey = new PluginKey<HarperPluginState>("harperSpellcheck");

/**
 * Convert a character offset in flat text (from doc.textBetween with " " separator)
 * to a ProseMirror document position.
 */
export function charOffsetToPos(doc: Node, charOffset: number): number {
  let charCount = 0;
  let result = 0;

  doc.descendants((node, pos) => {
    if (result > 0) return false;

    if (node.isBlock && node !== doc.firstChild && pos > 0) {
      // Account for the " " separator between blocks
      if (charCount < charOffset) {
        charCount += 1; // separator character
      }
    }

    if (node.isText) {
      const text = node.text ?? "";
      if (charCount + text.length > charOffset) {
        result = pos + (charOffset - charCount);
        return false;
      }
      charCount += text.length;
    }
    return true;
  });

  return result || 1;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    harperSpellcheck: {
      setSpellCheckEnabled: (enabled: boolean) => ReturnType;
      applySpellSuggestion: (
        from: number,
        to: number,
        replacement: string,
      ) => ReturnType;
    };
  }
}

export const HarperSpellcheck = Extension.create<{
  enabled: boolean;
  debounceMs: number;
  onSuggestionOpen: (payload: SuggestionOpenPayload) => void;
  onSuggestionClose: () => void;
}>({
  name: "harperSpellcheck",

  addOptions() {
    return {
      enabled: true,
      debounceMs: 500,
      onSuggestionOpen: () => {},
      onSuggestionClose: () => {},
    };
  },

  addStorage() {
    return {
      enabled: true,
      linter: null as Linter | null,
    };
  },

  addCommands() {
    return {
      setSpellCheckEnabled:
        (enabled: boolean) =>
        ({ dispatch, tr }) => {
          this.storage.enabled = enabled;
          if (dispatch) {
            if (!enabled) {
              // Clear decorations when disabled
              tr.setMeta(harperPluginKey, {
                decorations: DecorationSet.empty,
                lints: [],
              });
            }
            dispatch(tr);
          }
          if (!enabled) {
            this.options.onSuggestionClose();
          }
          return true;
        },
      applySpellSuggestion:
        (from: number, to: number, replacement: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            dispatch(tr.insertText(replacement, from, to));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin<HarperPluginState>({
        key: harperPluginKey,
        state: {
          init: () => ({
            decorations: DecorationSet.empty,
            lints: [],
          }),
          apply: (tr, value, _oldState, newState) => {
            const meta = tr.getMeta(harperPluginKey) as
              | HarperPluginState
              | undefined;
            if (meta) return meta;
            if (!tr.docChanged) return value;
            return {
              decorations: value.decorations.map(tr.mapping, newState.doc),
              lints: value.lints.map((l) => ({
                ...l,
                from: tr.mapping.map(l.from),
                to: tr.mapping.map(l.to),
              })),
            };
          },
        },
        view: (view: EditorView) => {
          let linter: Linter | null = null;
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;

          const initLinter = async () => {
            const [{ WorkerLinter }, { binary }] = await Promise.all([
              import("harper.js"),
              import("harper.js/binary"),
            ]);
            linter = new WorkerLinter({ binary });
            extension.storage.linter = linter;
            scheduleRun(view);
          };

          const scheduleRun = (currentView: EditorView) => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(
              () => runLint(currentView),
              extension.options.debounceMs,
            );
          };

          const runLint = async (currentView: EditorView) => {
            if (!linter || !extension.storage.enabled) return;

            const doc = currentView.state.doc;
            const text = doc.textBetween(0, doc.content.size, " ", "");
            if (!text.trim()) {
              // Empty doc — clear any stale decorations
              currentView.dispatch(
                currentView.state.tr.setMeta(harperPluginKey, {
                  decorations: DecorationSet.empty,
                  lints: [],
                }),
              );
              return;
            }

            try {
              const rawLints = await linter.lint(text, {
                language: "plaintext",
              });

              const results: LintResult[] = rawLints
                .filter(
                  (l) =>
                    l.span().start < text.length && l.span().end <= text.length,
                )
                .map((l, i) => {
                  const span = l.span();
                  const from = charOffsetToPos(doc, span.start);
                  const to = charOffsetToPos(doc, span.end);
                  return {
                    id: `harper-${i}-${span.start}-${span.end}`,
                    from,
                    to,
                    message: l.message(),
                    suggestions: l
                      .suggestions()
                      .map((s) => s.get_replacement_text())
                      .filter(Boolean),
                  };
                })
                .filter((r) => r.from < r.to);

              const decorations = DecorationSet.create(
                doc,
                results.map((r) =>
                  Decoration.inline(r.from, r.to, {
                    class: "harper-error",
                    "data-harper-id": r.id,
                  }),
                ),
              );

              // Only dispatch if the doc hasn't changed since we started
              if (currentView.state.doc.eq(doc)) {
                currentView.dispatch(
                  currentView.state.tr.setMeta(harperPluginKey, {
                    decorations,
                    lints: results,
                  }),
                );
              }
            } catch {
              // Linting failed — silently ignore
            }
          };

          initLinter();

          return {
            update(currentView, prevState) {
              if (!currentView.state.doc.eq(prevState.doc)) {
                scheduleRun(currentView);
              }
            },
            destroy() {
              if (debounceTimer) clearTimeout(debounceTimer);
              if (linter) {
                linter.dispose().catch(() => {});
              }
            },
          };
        },
        props: {
          decorations(state) {
            return (
              harperPluginKey.getState(state)?.decorations ??
              DecorationSet.empty
            );
          },
          handleClick(view, _pos, event) {
            if (!extension.storage.enabled) return false;
            const target = event.target as HTMLElement;
            const errorEl = target.closest(".harper-error") as HTMLElement | null;
            if (!errorEl) return false;
            const id = errorEl.getAttribute("data-harper-id");
            const pluginState = harperPluginKey.getState(view.state);
            const lint = pluginState?.lints.find((l) => l.id === id);
            if (!lint) return false;
            extension.options.onSuggestionOpen({
              lint,
              rect: errorEl.getBoundingClientRect(),
            });
            return true;
          },
        },
      }),
    ];
  },
});
