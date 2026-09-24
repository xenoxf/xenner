import type { DrawingTool } from "../types/drawing";

export const DRAWING_BLOCK_TOOLS: readonly { id: DrawingTool; label: string }[] = [
  { id: "pen", label: "Trazo" },
  { id: "rect", label: "Rectángulo" },
  { id: "ellipse", label: "Elipse" },
  { id: "line", label: "Línea" },
  { id: "arrow", label: "Flecha" },
  { id: "text", label: "Texto" },
];

export const DRAWING_TOOLS: readonly { id: DrawingTool; label: string }[] = [
  { id: "select", label: "Seleccionar" },
  { id: "hand", label: "Mano" },
  ...DRAWING_BLOCK_TOOLS,
];

export function isDrawingTool(value: unknown): value is DrawingTool {
  return typeof value === "string" && DRAWING_TOOLS.some((tool) => tool.id === value);
}
