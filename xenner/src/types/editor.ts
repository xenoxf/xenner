export type EditorBlockType = "paragraph" | "heading1" | "heading2" | "bullet" | "ordered" | "quote";
export type ShapeTool = "pen" | "rect" | "ellipse" | "line" | "arrow" | "text";
export type ShapeColor = "#5b9bd5" | "#e7e7e4" | "#e05d5d" | "#5ac47a" | "#f0b35c";

export interface PreparedMarkdown {
  content: string;
  replacements: Map<string, string>;
}

export interface ImportedEditorAsset {
  dataUrl: string;
  relativePath: string;
  fileName?: string;
}

export interface SelectedEditorAsset {
  dataUrl: string;
  relativePath: string;
  alt?: string;
}

export interface MarkdownEditorHandle {
  focus(): void;
  insertTextBlock(): void;
  setBlockType(type: EditorBlockType): void;
  insertAsset(dataUrl: string, relativePath: string, alt?: string): void;
  getSelectedAsset(): SelectedEditorAsset | null;
  replaceAsset(
    previousDataUrl: string,
    nextDataUrl: string,
    relativePath: string,
  ): boolean;
}
