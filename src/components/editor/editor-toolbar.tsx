"use client";

import { useState, useCallback } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Save,
  Clock,
  Check,
  MessageSquare,
  Bookmark,
  Maximize,
  Wifi,
  WifiOff,
  AlertTriangle,
  Mic,
  Sparkles,
  PanelRight,
  ClipboardCheck,
  LayoutList,
  ListTodo,
  ShieldCheck,
  SpellCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SceneStatus } from "@/lib/types";

interface EditorToolbarProps {
  editor: Editor | null;
  status: SceneStatus;
  onStatusChange: (status: string) => void;
  saving: boolean;
  lastSaved: string | null;
  onManualSave: () => void;
  onToggleVersions: () => void;
  showVersions: boolean;
  onToggleAnnotations: () => void;
  showAnnotations: boolean;
  annotationCount: number;
  isOnline: boolean;
  fromCache?: boolean;
  showFocusButton: boolean;
  projectId: string;
  nodeId: string;
  onInsertBeat: () => void;
  onToggleConsistencyAlerts?: () => void;
  showConsistencyAlerts?: boolean;
  consistencyAlertCount?: number;
  onToggleVoiceMonitor?: () => void;
  showVoiceMonitor?: boolean;
  onToggleCritiquePanel?: () => void;
  showCritiquePanel?: boolean;
  onToggleSceneContext?: () => void;
  showSceneContext?: boolean;
  onToggleSpellCheck?: () => void;
  spellCheckEnabled?: boolean;
  onReviewScene?: () => void;
  onPlanBeats?: () => void;
  onCanonCheck?: () => void;
  onAddTask?: (name: string) => Promise<void>;
}

export function EditorToolbar({
  editor,
  status,
  onStatusChange,
  saving,
  lastSaved,
  onManualSave,
  onToggleVersions,
  showVersions,
  onToggleAnnotations,
  showAnnotations,
  annotationCount,
  isOnline,
  fromCache = false,
  showFocusButton,
  projectId,
  nodeId,
  onInsertBeat,
  onToggleConsistencyAlerts,
  showConsistencyAlerts,
  consistencyAlertCount = 0,
  onToggleVoiceMonitor,
  showVoiceMonitor,
  onToggleCritiquePanel,
  showCritiquePanel,
  onToggleSceneContext,
  showSceneContext,
  onToggleSpellCheck,
  spellCheckEnabled = true,
  onReviewScene,
  onPlanBeats,
  onCanonCheck,
  onAddTask,
}: EditorToolbarProps) {
  const [taskName, setTaskName] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [taskPopoverOpen, setTaskPopoverOpen] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const handleSubmitTask = useCallback(async () => {
    if (!taskName.trim() || addingTask) return;
    setAddingTask(true);
    setTaskError(null);
    try {
      await onAddTask!(taskName.trim());
      setTaskName("");
      setTaskPopoverOpen(false);
    } catch {
      setTaskError("Could not add task. Please try again.");
    } finally {
      setAddingTask(false);
    }
  }, [taskName, addingTask, onAddTask]);

  // Derived aria-label text, shared with tooltip content so the two never drift apart.
  const annotationsLabel = `${showAnnotations ? "Hide" : "Show"} annotations${annotationCount > 0 ? ` (${annotationCount})` : ""}`;
  const consistencyAlertsLabel = `${showConsistencyAlerts ? "Hide" : "Show"} consistency alerts${consistencyAlertCount > 0 ? ` (${consistencyAlertCount})` : ""}`;
  const voiceMonitorLabel = `${showVoiceMonitor ? "Hide" : "Show"} voice monitor`;
  const critiquePanelLabel = `${showCritiquePanel ? "Hide" : "Show"} Annie's critique`;
  const sceneContextLabel = `${showSceneContext ? "Hide" : "Show"} scene context sidebar`;
  const spellCheckLabel = `${spellCheckEnabled ? "Disable" : "Enable"} spelling and grammar checking`;

  return (
    <TooltipProvider>
    <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-surface-raised shrink-0 overflow-x-auto" role="toolbar" aria-label="Text formatting">
      <div className="flex items-center gap-0.5 mr-3 shrink-0">
        {[
          { icon: Bold, label: "Bold", action: () => editor?.chain().focus().toggleBold().run(), active: editor?.isActive("bold") },
          { icon: Italic, label: "Italic", action: () => editor?.chain().focus().toggleItalic().run(), active: editor?.isActive("italic") },
          { icon: UnderlineIcon, label: "Underline", action: () => editor?.chain().focus().toggleUnderline().run(), active: editor?.isActive("underline") },
        ].map(({ icon: Icon, label, action, active }, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", active && "bg-accent/15 text-accent")}
                onClick={action}
                aria-label={label}
                aria-pressed={!!active}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="w-px h-5 bg-border mx-1" aria-hidden="true" />

      <div className="flex items-center gap-0.5 mr-3 shrink-0">
        {[
          { icon: Heading1, label: "Heading 1", action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), active: editor?.isActive("heading", { level: 1 }) },
          { icon: Heading2, label: "Heading 2", action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: editor?.isActive("heading", { level: 2 }) },
          { icon: Heading3, label: "Heading 3", action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), active: editor?.isActive("heading", { level: 3 }) },
        ].map(({ icon: Icon, label, action, active }, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", active && "bg-accent/15 text-accent")}
                onClick={action}
                aria-label={label}
                aria-pressed={!!active}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="w-px h-5 bg-border mx-1" aria-hidden="true" />

      <div className="flex items-center gap-0.5 shrink-0">
        {[
          { icon: List, label: "Bullet list", action: () => editor?.chain().focus().toggleBulletList().run(), active: editor?.isActive("bulletList") },
          { icon: ListOrdered, label: "Numbered list", action: () => editor?.chain().focus().toggleOrderedList().run(), active: editor?.isActive("orderedList") },
          { icon: Quote, label: "Block quote", action: () => editor?.chain().focus().toggleBlockquote().run(), active: editor?.isActive("blockquote") },
        ].map(({ icon: Icon, label, action, active }, i) => (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", active && "bg-accent/15 text-accent")}
                onClick={action}
                aria-label={label}
                aria-pressed={!!active}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <div className="w-px h-5 bg-border mx-1" aria-hidden="true" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onInsertBeat}
            aria-label="Insert beat"
          >
            <Bookmark className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Insert beat</TooltipContent>
      </Tooltip>

      <div className="w-px h-5 bg-border mx-1" aria-hidden="true" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor?.chain().focus().undo().run()} aria-label="Undo">
            <Undo className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => editor?.chain().focus().redo().run()} aria-label="Redo">
            <Redo className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo</TooltipContent>
      </Tooltip>

      <div className="flex-1" />

      <div className="flex items-center gap-2 shrink-0 pr-2">
        {onAddTask && (
          <Popover open={taskPopoverOpen} onOpenChange={setTaskPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Add writing task for this scene"
              >
                <ListTodo className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <p className="text-xs font-semibold text-text-muted mb-2">Add Task</p>
              <Input
                placeholder="Task name…"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitTask();
                }}
                className="h-8 text-sm mb-2"
                autoFocus
              />
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                disabled={!taskName.trim() || addingTask}
                onClick={handleSubmitTask}
              >
                {addingTask ? "Adding…" : "Add Task"}
              </Button>
              {taskError && (
                <p className="text-xs text-destructive mt-1">{taskError}</p>
              )}
            </PopoverContent>
          </Popover>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", showAnnotations && "bg-accent/15 text-accent")}
              onClick={onToggleAnnotations}
              aria-label={annotationsLabel}
              aria-pressed={showAnnotations}
            >
              <div className="relative">
                <MessageSquare className="h-4 w-4" />
                {annotationCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent animate-pulse" aria-hidden="true" />
                )}
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{annotationsLabel}</TooltipContent>
        </Tooltip>

        {onToggleConsistencyAlerts && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", showConsistencyAlerts && "bg-amber-500/15 text-amber-600 dark:text-amber-400")}
                onClick={onToggleConsistencyAlerts}
                aria-label={consistencyAlertsLabel}
                aria-pressed={showConsistencyAlerts}
              >
                <div className="relative">
                  <AlertTriangle className="h-4 w-4" />
                  {consistencyAlertCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-500 text-white text-[8px] flex items-center justify-center font-bold" aria-hidden="true">
                      {consistencyAlertCount > 9 ? "9+" : consistencyAlertCount}
                    </span>
                  )}
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{consistencyAlertsLabel}</TooltipContent>
          </Tooltip>
        )}

        {onToggleVoiceMonitor && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", showVoiceMonitor && "bg-blue-500/15 text-blue-600 dark:text-blue-400")}
                onClick={onToggleVoiceMonitor}
                aria-label={voiceMonitorLabel}
                aria-pressed={showVoiceMonitor}
              >
                <Mic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{voiceMonitorLabel}</TooltipContent>
          </Tooltip>
        )}

        {onToggleCritiquePanel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", showCritiquePanel && "bg-accent/15 text-accent")}
                onClick={onToggleCritiquePanel}
                aria-label={critiquePanelLabel}
                aria-pressed={showCritiquePanel}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{critiquePanelLabel}</TooltipContent>
          </Tooltip>
        )}

        {onToggleSceneContext && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", showSceneContext && "bg-accent/15 text-accent")}
                onClick={onToggleSceneContext}
                aria-label={sceneContextLabel}
                aria-pressed={showSceneContext}
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sceneContextLabel}</TooltipContent>
          </Tooltip>
        )}

        {onToggleSpellCheck && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", spellCheckEnabled && "bg-accent/15 text-accent")}
                onClick={onToggleSpellCheck}
                aria-label={spellCheckLabel}
                aria-pressed={spellCheckEnabled}
              >
                <SpellCheck className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{spellCheckLabel}</TooltipContent>
          </Tooltip>
        )}

        {onPlanBeats && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onPlanBeats}
                aria-label="Plan scene beats"
              >
                <LayoutList className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Plan scene beats</TooltipContent>
          </Tooltip>
        )}

        {onReviewScene && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onReviewScene}
                aria-label="Review this scene"
              >
                <ClipboardCheck className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Review this scene</TooltipContent>
          </Tooltip>
        )}

        {onCanonCheck && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onCanonCheck}
                aria-label="Canon check — cross-reference story bible"
              >
                <ShieldCheck className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Canon check — cross-reference story bible</TooltipContent>
          </Tooltip>
        )}

        {showFocusButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => window.location.href = `/project/${projectId}/scene/${nodeId}/focus`}
                aria-label="Focus mode"
              >
                <Maximize className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Focus mode</TooltipContent>
          </Tooltip>
        )}

        {fromCache && (
          <Badge variant="secondary" className="text-xs h-5">
            Cached
          </Badge>
        )}

        <div
          className="flex items-center gap-1.5 ml-2 px-2 py-1 rounded-md text-xs cursor-help transition-colors"
          role="status"
          aria-label={isOnline ? "Backend connected" : "Backend disconnected — edits may not save"}
        >
          {isOnline ? (
            <>
              <Wifi className="h-3 w-3 text-success" aria-hidden="true" />
              <span className="text-text-muted hidden sm:inline-block">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-danger animate-pulse" aria-hidden="true" />
              <span className="text-danger hidden sm:inline-block">Disconnected</span>
            </>
          )}
        </div>

        <Select value={status} onValueChange={onStatusChange}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OUTLINE">Outline</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="REVISED">Revised</SelectItem>
            <SelectItem value="FINAL">Final</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5 ml-2"
          onClick={onManualSave}
          disabled={saving}
        >
          {saving ? (
            <div className="h-3 w-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          ) : lastSaved ? (
            <Check className="h-3 w-3 text-success" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          {saving ? "Saving..." : lastSaved ? `Saved` : "Save"}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 ml-1", showVersions && "bg-accent/15 text-accent")}
              onClick={onToggleVersions}
              aria-label="Version history"
              aria-pressed={showVersions}
            >
              <Clock className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Version history</TooltipContent>
        </Tooltip>
      </div>
    </div>
    </TooltipProvider>
  );
}
