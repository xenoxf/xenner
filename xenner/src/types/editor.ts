import type { DrawingTool } from "./drawing";

export type EditorBlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "ordered"
  | "quote";

export interface PreparedMarkdown {
  content: string;
  replacements: Map<string, string>;
  revisions: Map<string, string>;
}

export interface ImportedEditorAsset {
  dataUrl: string;
  relativePath: string;
  revision?: string;
  fileName?: string;
}

export interface MarkdownEditorHandle {
  focus(): void;
  setBlockType(type: EditorBlockType): void;
  insertWhiteboard(tool: DrawingTool): Promise<void>;
  insertAsset(
    dataUrl: string,
    relativePath: string,
    alt?: string,
    revision?: string,
  ): void | Promise<void>;
}
