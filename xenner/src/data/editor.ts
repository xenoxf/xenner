import type { EditorBlockType, ShapeColor, ShapeTool } from "../types/editor";

export const SHAPE_TOOLS: readonly { id: ShapeTool; label: string }[] = [
  { id: "pen", label: "Trazo" },
  { id: "rect", label: "Rectángulo" },
  { id: "ellipse", label: "Elipse" },
  { id: "line", label: "Línea" },
  { id: "arrow", label: "Flecha" },
  { id: "text", label: "Texto" },
];

export const SHAPE_COLORS: readonly ShapeColor[] = [
  "#5b9bd5",
  "#e7e7e4",
  "#e05d5d",
  "#5ac47a",
  "#f0b35c",
];

export const EDITOR_BLOCKS: readonly { id: EditorBlockType; label: string }[] = [
  { id: "paragraph", label: "Texto" },
  { id: "heading1", label: "Título 1" },
  { id: "heading2", label: "Título 2" },
  { id: "bullet", label: "Lista" },
  { id: "ordered", label: "Numerada" },
  { id: "quote", label: "Cita" },
];
