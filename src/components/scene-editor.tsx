"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { StructureNode, SceneStatus, ContentVersion } from "@/lib/types";
import { SCENE_STATUS_COLORS } from "@/lib/types";

interface SceneEditorProps {
  node: StructureNode;
  projectId: string;
  onNodeUpdated: () => void;
}

export function SceneEditor({ node, projectId, onNodeUpdated }: SceneEditorProps) {
  const [content, setContent] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [synopsis, setSynopsis] = useState(node.synopsis);
  const [status, setStatus] = useState<SceneStatus>(node.status as SceneStatus);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentLoadedRef = useRef(false);

  // Load content
  useEffect(() => {
    contentLoadedRef.current = false;
    fetch(`/api/nodes/${node.id}/content`)
      .then((res) => res.json())
      .then((data) => {
        const latestContent = data.latest?.content || "";
        const latestWordCount = data.latest?.wordCount || 0;
        setContent(latestContent);
        setWordCount(latestWordCount);
        if (editor) {
          editor.commands.setContent(latestContent);
        }
        contentLoadedRef.current = true;
      })
      .catch(() => {
        contentLoadedRef.current = true;
      });
  }, [node.id]);

  // Reset metadata when node changes
  useEffect(() => {
    setSynopsis(node.synopsis);
    setStatus(node.status as SceneStatus);
  }, [node.id, node.synopsis, node.status]);

  const saveContent = useCallback(
    async (html: string) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/nodes/${node.id}/content`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: html }),
        });
        if (res.ok) {
          const version = await res.json();
          setWordCount(version.wordCount);
          setLastSaved(new Date());
          onNodeUpdated();
        }
      } finally {
        setSaving(false);
      }
    },
    [node.id, onNodeUpdated]
  );

  const saveMetadata = useCallback(
    async (updates: { synopsis?: string; status?: string }) => {
      await fetch(`/api/nodes/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      onNodeUpdated();
    },
    [node.id, onNodeUpdated]
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder: "Start writing your scene...",
      }),
    ],
    content: content,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[400px] px-6 py-4",
      },
    },
    onUpdate: ({ editor }) => {
      if (!contentLoadedRef.current) return;
      const html = editor.getHTML();

      // Debounced auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveContent(html);
      }, 2000);
    },
  });

  // Manual save
  const handleManualSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (editor) {
      saveContent(editor.getHTML());
    }
  };

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b bg-white">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-active={editor.isActive("bold")}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-active={editor.isActive("italic")}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          data-active={editor.isActive("underline")}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          data-active={editor.isActive("heading", { level: 2 })}
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          data-active={editor.isActive("heading", { level: 3 })}
        >
          <Heading3 className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          data-active={editor.isActive("bulletList")}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          data-active={editor.isActive("orderedList")}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo className="h-4 w-4" />
        </Button>

        <div className="flex-1" />

        <span className="text-xs text-gray-400 tabular-nums mr-2">
          {wordCount} words
        </span>
        {saving ? (
          <span className="text-xs text-gray-400">Saving...</span>
        ) : lastSaved ? (
          <span className="text-xs text-gray-400">Saved</span>
        ) : null}
        <Button variant="ghost" size="sm" onClick={handleManualSave} className="ml-1">
          <Save className="h-4 w-4 mr-1" />
          Save
        </Button>
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto bg-white">
        <EditorContent editor={editor} />
      </div>

      {/* Metadata panel at bottom */}
      <div className="border-t bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Status:</span>
            <Select
              value={status}
              onValueChange={(val) => {
                setStatus(val as SceneStatus);
                saveMetadata({ status: val });
              }}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OUTLINE">Outline</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="REVISED">Revised</SelectItem>
                <SelectItem value="FINAL">Final</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Input
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              onBlur={() => saveMetadata({ synopsis })}
              placeholder="Scene synopsis..."
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
