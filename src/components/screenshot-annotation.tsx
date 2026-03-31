"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Square,
  Highlighter,
  MoveRight,
  Type,
  Undo2,
  Trash2,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnnotationTool = "redact" | "highlight" | "arrow" | "text";

interface Point {
  x: number;
  y: number;
}

interface RectAnnotation {
  kind: "redact" | "highlight";
  start: Point;
  end: Point;
}

interface ArrowAnnotation {
  kind: "arrow";
  start: Point;
  end: Point;
}

interface TextAnnotation {
  kind: "text";
  position: Point;
  value: string;
}

type Annotation = RectAnnotation | ArrowAnnotation | TextAnnotation;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScreenshotAnnotationProps {
  /** CSS selector or ref to the element to screenshot. Defaults to document body. */
  targetSelector?: string;
  /** Called when user confirms the annotated screenshot (base64 PNG data URL). */
  onCapture: (dataUrl: string) => void;
  /** Called when user cancels / dismisses. */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  canvasWidth: number,
  canvasHeight: number,
  imageWidth: number,
  imageHeight: number,
): void {
  const scaleX = imageWidth / canvasWidth;
  const scaleY = imageHeight / canvasHeight;

  for (const a of annotations) {
    switch (a.kind) {
      case "redact": {
        const x = Math.min(a.start.x, a.end.x) * scaleX;
        const y = Math.min(a.start.y, a.end.y) * scaleY;
        const w = Math.abs(a.end.x - a.start.x) * scaleX;
        const h = Math.abs(a.end.y - a.start.y) * scaleY;
        ctx.fillStyle = "#000000";
        ctx.fillRect(x, y, w, h);
        break;
      }
      case "highlight": {
        const x = Math.min(a.start.x, a.end.x) * scaleX;
        const y = Math.min(a.start.y, a.end.y) * scaleY;
        const w = Math.abs(a.end.x - a.start.x) * scaleX;
        const h = Math.abs(a.end.y - a.start.y) * scaleY;
        ctx.fillStyle = "rgba(255, 255, 0, 0.35)";
        ctx.fillRect(x, y, w, h);
        break;
      }
      case "arrow": {
        const sx = a.start.x * scaleX;
        const sy = a.start.y * scaleY;
        const ex = a.end.x * scaleX;
        const ey = a.end.y * scaleY;
        const headLen = 14;
        const angle = Math.atan2(ey - sy, ex - sx);

        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - headLen * Math.cos(angle - Math.PI / 6),
          ey - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
          ex - headLen * Math.cos(angle + Math.PI / 6),
          ey - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fillStyle = "#ff0000";
        ctx.fill();
        break;
      }
      case "text": {
        const tx = a.position.x * scaleX;
        const ty = a.position.y * scaleY;
        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = "#ff0000";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.strokeText(a.value, tx, ty);
        ctx.fillText(a.value, tx, ty);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScreenshotAnnotation({
  targetSelector,
  onCapture,
  onCancel,
}: ScreenshotAnnotationProps) {
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [activeTool, setActiveTool] = useState<AnnotationTool>("redact");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<Point | null>(null);
  const [textInput, setTextInput] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ---- Capture screenshot ----
  const captureScreenshot = useCallback(async () => {
    setCapturing(true);
    try {
      const target =
        targetSelector
          ? document.querySelector<HTMLElement>(targetSelector)
          : document.body;
      if (!target) throw new Error("Target element not found");

      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 1,
      });
      setScreenshotUrl(dataUrl);
      setAnnotations([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Screenshot capture failed:", msg);
    } finally {
      setCapturing(false);
    }
  }, [targetSelector]);

  // Auto-capture on mount
  useEffect(() => {
    void captureScreenshot();
  }, [captureScreenshot]);

  // ---- Draw canvas whenever annotations or image change ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !screenshotUrl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;

      // Draw base image scaled to canvas size
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw saved annotations
      drawAnnotations(
        ctx,
        annotations,
        canvas.width,
        canvas.height,
        img.width,
        img.height,
      );

      // Draw in-progress annotation
      if (drawing && drawStart && drawCurrent) {
        const tempAnnotation: Annotation =
          activeTool === "arrow"
            ? { kind: "arrow", start: drawStart, end: drawCurrent }
            : { kind: activeTool as "redact" | "highlight", start: drawStart, end: drawCurrent };
        drawAnnotations(
          ctx,
          [tempAnnotation],
          canvas.width,
          canvas.height,
          img.width,
          img.height,
        );
      }
    };
    img.src = screenshotUrl;
  }, [screenshotUrl, annotations, drawing, drawStart, drawCurrent, activeTool]);

  // ---- Mouse handlers ----
  const getCanvasPoint = (e: ReactMouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (activeTool === "text") {
      setTextInput(getCanvasPoint(e));
      setTextValue("");
      return;
    }
    setDrawing(true);
    setDrawStart(getCanvasPoint(e));
    setDrawCurrent(getCanvasPoint(e));
  };

  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    setDrawCurrent(getCanvasPoint(e));
  };

  const handleMouseUp = () => {
    if (!drawing || !drawStart || !drawCurrent) {
      setDrawing(false);
      return;
    }

    const newAnnotation: Annotation =
      activeTool === "arrow"
        ? { kind: "arrow", start: drawStart, end: drawCurrent }
        : { kind: activeTool as "redact" | "highlight", start: drawStart, end: drawCurrent };

    setAnnotations((prev) => [...prev, newAnnotation]);
    setDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  };

  const handleTextSubmit = () => {
    if (textInput && textValue.trim()) {
      setAnnotations((prev) => [
        ...prev,
        { kind: "text", position: textInput, value: textValue.trim() },
      ]);
    }
    setTextInput(null);
    setTextValue("");
  };

  const handleUndo = () => {
    setAnnotations((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setAnnotations([]);
  };

  // ---- Export final image ----
  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Render at full resolution
    const img = imageRef.current;
    if (!img) return;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = img.width;
    exportCanvas.height = img.height;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);
    drawAnnotations(ctx, annotations, canvas.width, canvas.height, img.width, img.height);

    onCapture(exportCanvas.toDataURL("image/png"));
  };

  // ---- Toolbar ----
  const tools: { id: AnnotationTool; label: string; icon: typeof Square }[] = [
    { id: "redact", label: "Redact", icon: Square },
    { id: "highlight", label: "Highlight", icon: Highlighter },
    { id: "arrow", label: "Arrow", icon: MoveRight },
    { id: "text", label: "Text", icon: Type },
  ];

  // ---- Render ----
  if (!screenshotUrl) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        {capturing ? (
          <p className="text-sm text-text-secondary">Capturing screenshot...</p>
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              Failed to capture screenshot.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={captureScreenshot}>
                <Camera className="h-4 w-4 mr-1" />
                Retry
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Skip
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1">
        {tools.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={activeTool === id ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTool(id)}
            title={label}
          >
            <Icon className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}

        <div className="mx-1 h-6 w-px bg-border/30" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleUndo}
          disabled={annotations.length === 0}
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={annotations.length === 0}
          title="Clear all"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={captureScreenshot}
          title="Retake screenshot"
        >
          <Camera className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-text-secondary">
        <strong>Privacy first:</strong> Use the Redact tool (black rectangle) to
        cover any private manuscript text before submitting.
      </p>

      {/* Canvas */}
      <div className="relative border border-border/20 rounded overflow-hidden bg-surface-raised">
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          className="w-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* Inline text input */}
        {textInput && (
          <div
            className="absolute"
            style={{ left: textInput.x, top: textInput.y }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTextSubmit();
              }}
              className="flex gap-1"
            >
              <input
                autoFocus
                className="border border-border bg-surface-raised text-sm px-1 py-0.5 rounded w-40"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Type annotation..."
                onBlur={handleTextSubmit}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setTextInput(null)}>
                <X className="h-3 w-3" />
              </Button>
            </form>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Remove Screenshot
        </Button>
        <Button size="sm" onClick={handleConfirm}>
          Attach Screenshot
        </Button>
      </div>
    </div>
  );
}
