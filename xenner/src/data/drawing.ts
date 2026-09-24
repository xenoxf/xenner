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
  ...DRAWING_BLOCK_TOOLS,
];
