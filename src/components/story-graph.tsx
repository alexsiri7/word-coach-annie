"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

interface GraphNode {
  id: string;
  label: string;
  type: "structureNode" | "storyObject";
  entityType: string;
  x?: number;
  y?: number;
}

interface GraphEdge {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  label: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const ENTITY_COLORS: Record<string, string> = {
  SCENE: "#3b82f6",
  CHAPTER: "#6366f1",
  PART: "#8b5cf6",
  CHARACTER: "#22c55e",
  LOCATION: "#f97316",
  PLOTLINE: "#ec4899",
  WORLD_ELEMENT: "#06b6d4",
  NOTE: "#a3a3a3",
};

const ENTITY_RADIUS: Record<string, number> = {
  PART: 8,
  CHAPTER: 7,
  SCENE: 5,
  CHARACTER: 6,
  LOCATION: 6,
  PLOTLINE: 6,
  WORLD_ELEMENT: 5,
  NOTE: 4,
};

interface StoryGraphProps {
  projectId: string;
}

export function StoryGraph({ projectId }: StoryGraphProps) {
  const router = useRouter();
  const graphRef = useRef<{ zoomToFit: (ms?: number) => void; zoom: (k: number, ms?: number) => void }>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    async function fetchGraph() {
      try {
        const res = await fetch(`/api/projects/${projectId}/graph`);
        if (!res.ok) throw new Error("Failed to load graph data");
        const data: GraphData = await res.json();
        setGraphData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchGraph();
  }, [projectId]);

  const forceGraphData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };
    return {
      nodes: graphData.nodes,
      links: graphData.edges.map((e) => ({
        ...e,
        source: typeof e.source === "string" ? e.source : e.source.id,
        target: typeof e.target === "string" ? e.target : e.target.id,
      })),
    };
  }, [graphData]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.type === "structureNode" && node.entityType === "SCENE") {
        router.push(`/project/${projectId}/scene/${node.id}`);
      }
    },
    [router, projectId]
  );

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const radius = ENTITY_RADIUS[node.entityType] ?? 5;
      const color = ENTITY_COLORS[node.entityType] ?? "#a3a3a3";
      const isHovered = hoveredNode?.id === node.id;

      // Draw node circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw label when zoomed in enough or hovered
      if (globalScale > 1.5 || isHovered) {
        const fontSize = Math.max(12 / globalScale, 3);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.85)";
        ctx.fillText(node.label, x, y + radius + 2);
      }
    },
    [hoveredNode]
  );

  const linkCanvasObject = useCallback(
    (link: { source: GraphNode; target: GraphNode; label: string }, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const sx = link.source.x ?? 0;
      const sy = link.source.y ?? 0;
      const tx = link.target.x ?? 0;
      const ty = link.target.y ?? 0;

      // Draw edge line
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = "rgba(150, 150, 150, 0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw label at midpoint when zoomed in
      if (globalScale > 2.5 && link.label) {
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const fontSize = Math.max(10 / globalScale, 2.5);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(200, 200, 200, 0.7)";
        ctx.fillText(link.label, mx, my);
      }
    },
    []
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-danger">
        {error}
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        No graph data yet. Add scenes, characters, and relationships to see your story graph.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" ref={containerRef}>
      <ForceGraph2D
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={forceGraphData}
        nodeCanvasObject={nodeCanvasObject}
        linkCanvasObject={linkCanvasObject}
        onNodeClick={handleNodeClick}
        onNodeHover={(node: GraphNode | null) => setHoveredNode(node)}
        nodeLabel=""
        enablePanInteraction={true}
        enableZoomInteraction={true}
        enableNodeDrag={true}
        cooldownTicks={100}
        onEngineStop={() => graphRef.current?.zoomToFit(400)}
        backgroundColor="transparent"
      />

      {/* Controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-surface/80 backdrop-blur-sm"
          onClick={() => graphRef.current?.zoom(1.5, 300)}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-surface/80 backdrop-blur-sm"
          onClick={() => graphRef.current?.zoom(0.67, 300)}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-surface/80 backdrop-blur-sm"
          onClick={() => graphRef.current?.zoomToFit(400)}
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 rounded-lg bg-surface/80 p-3 backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary">
          {Object.entries(ENTITY_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="capitalize">{type.toLowerCase().replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hovered node tooltip */}
      {hoveredNode && (
        <div className="absolute left-3 top-3 rounded-lg bg-surface/90 px-3 py-2 backdrop-blur-sm">
          <div className="text-sm font-medium text-text-primary">{hoveredNode.label}</div>
          <div className="text-xs text-text-muted capitalize">
            {hoveredNode.entityType.toLowerCase().replace("_", " ")}
            {hoveredNode.type === "structureNode" && hoveredNode.entityType === "SCENE" && (
              <span className="ml-1 text-accent">(click to open)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
