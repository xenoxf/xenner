import type { EditorBlockType } from "../types/editor";

export const EDITOR_BLOCKS: readonly { id: EditorBlockType; label: string }[] = [
  { id: "paragraph", label: "Texto" },
  { id: "heading1", label: "Título 1" },
  { id: "heading2", label: "Título 2" },
  { id: "heading3", label: "Título 3" },
  { id: "bullet", label: "Lista" },
  { id: "ordered", label: "Numerada" },
  { id: "quote", label: "Cita" },
];
