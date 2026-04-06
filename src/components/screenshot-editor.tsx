"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  EyeOff,
  Highlighter,
  MoveRight,
  Type,
  Undo2,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Tool = "redact" | "highlight" | "arrow" | "text";

interface RectAnnotation {
  type: "redact" | "highlight";
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ArrowAnnotation {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface TextAnnotation {
  type: "text";
  x: number;
  y: number;
  text: string;
}

type Annotation = RectAnnotation | ArrowAnnotation | TextAnnotation;

interface ScreenshotEditorProps {
  imageDataUrl: string;
  onSave: (editedDataUrl: string) => void;
  onCancel: () => void;
}

const HIGHLIGHT_COLOR = "rgba(255, 230, 0, 0.35)";
const REDACT_COLOR = "#000000";
const ARROW_COLOR = "#ef4444";
const TEXT_COLOR = "#ef4444";
const TEXT_FONT = "bold 16px sans-serif";

export function ScreenshotEditor({
  imageDataUrl,
  onSave,
  onCancel,
}: ScreenshotEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("redact");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [textInput, setTextInput] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [displayScale, setDisplayScale] = useState(1);
  const textInputRef = useRef<HTMLInputElement>(null);
  const textInputCreatedAt = useRef<number>(0);

  // Load the image and set up canvas dimensions
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      canvas.width = img.width;
      canvas.height = img.height;

      // Calculate display scale to fit container
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight - 8; // padding
      const scaleX = containerWidth / img.width;
      const scaleY = containerHeight / img.height;
      const scale = Math.min(scaleX, scaleY, 1);
      setDisplayScale(scale);

      redraw(img, []);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const redraw = useCallback(
    (
      img: HTMLImageElement,
      annots: Annotation[],
      preview?: { tool: Tool; x1: number; y1: number; x2: number; y2: number }
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw base image
      ctx.drawImage(img, 0, 0);

      // Draw saved annotations
      for (const a of annots) {
        drawAnnotation(ctx, a);
      }

      // Draw preview of current drawing
      if (preview) {
        if (preview.tool === "redact" || preview.tool === "highlight") {
          drawAnnotation(ctx, {
            type: preview.tool,
            x: Math.min(preview.x1, preview.x2),
            y: Math.min(preview.y1, preview.y2),
            w: Math.abs(preview.x2 - preview.x1),
            h: Math.abs(preview.y2 - preview.y1),
          });
        } else if (preview.tool === "arrow") {
          drawAnnotation(ctx, {
            type: "arrow",
            x1: preview.x1,
            y1: preview.y1,
            x2: preview.x2,
            y2: preview.y2,
          });
        }
      }
    },
    []
  );

  // Re-render when annotations change
  useEffect(() => {
    if (imageRef.current) {
      redraw(imageRef.current, annotations);
    }
  }, [annotations, redraw]);

  function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation) {
    if (a.type === "redact") {
      ctx.fillStyle = REDACT_COLOR;
      ctx.fillRect(a.x, a.y, a.w, a.h);
    } else if (a.type === "highlight") {
      ctx.fillStyle = HIGHLIGHT_COLOR;
      ctx.fillRect(a.x, a.y, a.w, a.h);
    } else if (a.type === "arrow") {
      drawArrow(ctx, a.x1, a.y1, a.x2, a.y2);
    } else if (a.type === "text") {
      ctx.font = TEXT_FONT;
      ctx.fillStyle = TEXT_COLOR;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.strokeText(a.text, a.x, a.y);
      ctx.fillText(a.text, a.x, a.y);
    }
  }

  function drawArrow(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) {
    const headLen = 14;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.strokeStyle = ARROW_COLOR;
    ctx.fillStyle = ARROW_COLOR;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // Shaft
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  // Convert screen coordinates to canvas coordinates
  function toCanvasCoords(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / displayScale,
      y: (e.clientY - rect.top) / displayScale,
    };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (textInput) return; // text input is open
    const pos = toCanvasCoords(e);

    if (tool === "text") {
      setTextInput(pos);
      setTextValue("");
      textInputCreatedAt.current = Date.now();
      setTimeout(() => textInputRef.current?.focus(), 10);
      return;
    }

    setDrawing(true);
    setStartPos(pos);
    setCurrentPos(pos);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing || !imageRef.current) return;
    const pos = toCanvasCoords(e);
    setCurrentPos(pos);

    redraw(imageRef.current, annotations, {
      tool,
      x1: startPos.x,
      y1: startPos.y,
      x2: pos.x,
      y2: pos.y,
    });
  }

  function handlePointerUp() {
    if (!drawing) return;
    setDrawing(false);

    const minSize = 4;
    if (tool === "redact" || tool === "highlight") {
      const w = Math.abs(currentPos.x - startPos.x);
      const h = Math.abs(currentPos.y - startPos.y);
      if (w > minSize && h > minSize) {
        setAnnotations((prev) => [
          ...prev,
          {
            type: tool,
            x: Math.min(startPos.x, currentPos.x),
            y: Math.min(startPos.y, currentPos.y),
            w,
            h,
          },
        ]);
      }
    } else if (tool === "arrow") {
      const dx = currentPos.x - startPos.x;
      const dy = currentPos.y - startPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > minSize) {
        setAnnotations((prev) => [
          ...prev,
          {
            type: "arrow",
            x1: startPos.x,
            y1: startPos.y,
            x2: currentPos.x,
            y2: currentPos.y,
          },
        ]);
      }
    }
  }

  function handleTextSubmit() {
    if (textInput && textValue.trim()) {
      setAnnotations((prev) => [
        ...prev,
        { type: "text", x: textInput.x, y: textInput.y, text: textValue.trim() },
      ]);
    }
    setTextInput(null);
    setTextValue("");
  }

  function handleUndo() {
    setAnnotations((prev) => prev.slice(0, -1));
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Export as JPEG for smaller file size
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onSave(dataUrl);
  }

  const tools: { id: Tool; icon: typeof EyeOff; label: string }[] = [
    { id: "redact", icon: EyeOff, label: "Redact" },
    { id: "highlight", icon: Highlighter, label: "Highlight" },
    { id: "arrow", icon: MoveRight, label: "Arrow" },
    { id: "text", icon: Type, label: "Text" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border/15 bg-surface-raised px-4 py-2">
        <div className="flex items-center gap-1">
          {tools.map((t) => (
            <Button
              key={t.id}
              variant={tool === t.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setTool(t.id)}
              title={t.label}
            >
              <t.icon className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">{t.label}</span>
            </Button>
          ))}
          <div className="mx-2 h-6 w-px bg-border/15" />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            disabled={annotations.length === 0}
            title="Undo"
          >
            <Undo2 className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Undo</span>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Check className="h-4 w-4 mr-1" />
            Done
          </Button>
        </div>
      </div>

      {/* Privacy notice */}
      <div className="bg-surface-overlay px-4 py-1.5 text-xs text-text-secondary text-center">
        Use <strong>Redact</strong> to black out any sensitive content before
        submitting. Your manuscript text may be visible.
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex items-center justify-center p-1 bg-surface"
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{
              width: canvasRef.current
                ? canvasRef.current.width * displayScale
                : "auto",
              height: canvasRef.current
                ? canvasRef.current.height * displayScale
                : "auto",
              cursor:
                tool === "text"
                  ? "text"
                  : tool === "arrow"
                    ? "crosshair"
                    : "crosshair",
            }}
            className="rounded shadow-lg"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          {/* Floating text input */}
          {textInput && (
            <div
              className="absolute"
              style={{
                left: textInput.x * displayScale,
                top: textInput.y * displayScale,
              }}
            >
              <input
                ref={textInputRef}
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTextSubmit();
                  if (e.key === "Escape") {
                    setTextInput(null);
                    setTextValue("");
                  }
                }}
                onBlur={() => {
                  // Ignore blur events that fire immediately after the input
                  // was created — the pointerdown on the canvas can race with
                  // autoFocus and cause an instant blur before the user types.
                  if (Date.now() - textInputCreatedAt.current < 200) {
                    // Re-focus the input instead of dismissing
                    setTimeout(() => textInputRef.current?.focus(), 0);
                    return;
                  }
                  handleTextSubmit();
                }}
                className="bg-white text-red-500 font-bold text-sm px-1 py-0.5 border border-red-400 rounded shadow-sm outline-none min-w-[120px]"
                placeholder="Type annotation..."
                autoFocus
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
