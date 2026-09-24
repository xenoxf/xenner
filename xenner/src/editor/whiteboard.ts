export const WHITEBOARD_CAPTION = "xenner:pizarra";

interface MarkdownAstNode {
  type: string;
  title?: string | null;
  children?: MarkdownAstNode[];
}

export function isWhiteboardCaption(value: unknown): boolean {
  return value === WHITEBOARD_CAPTION;
}

export function transformWhiteboardAst(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const node = value as MarkdownAstNode;
  if (
    (node.type === "image" || node.type === "image-block") &&
    isWhiteboardCaption(node.title)
  ) {
    node.type = "whiteboard";
  }
  for (const child of node.children ?? []) transformWhiteboardAst(child);
}
