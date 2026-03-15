import { useEffect, useRef } from "react";

interface KeyboardShortcutActions {
  onToggleSearch?: () => void;
  onClosePanel?: () => void;
  onToggleSidebar?: () => void;
}

/**
 * Global keyboard shortcuts:
 * - Cmd/Ctrl+K: Toggle search panel
 * - Cmd/Ctrl+/: Toggle sidebar
 * - Escape: Close open panels
 *
 * Cmd/Ctrl combos fire even when focus is in inputs/textareas.
 * Escape fires everywhere (including inputs) to dismiss panels.
 * Other shortcuts are suppressed when typing in inputs/textareas.
 */
export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K — toggle search
      if (isCmdOrCtrl && e.key === "k") {
        e.preventDefault();
        actionsRef.current.onToggleSearch?.();
        return;
      }

      // Cmd/Ctrl+/ — toggle sidebar
      if (isCmdOrCtrl && e.key === "/") {
        e.preventDefault();
        actionsRef.current.onToggleSidebar?.();
        return;
      }

      // Escape — close panels (works in inputs too)
      if (e.key === "Escape") {
        actionsRef.current.onClosePanel?.();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
