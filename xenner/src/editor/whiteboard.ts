export const WHITEBOARD_CAPTION = "xenner:pizarra";

interface MarkdownAstNode {
  type: string;
  url?: string;
  title?: string | null;
  children?: MarkdownAstNode[];
}

export function isWhiteboardCaption(value: unknown): boolean {
  return value === WHITEBOARD_CAPTION;
}

export function isWhiteboardSource(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]*={0,2}$/.test(value)
  );
}

function isMarkedWhiteboardImage(node: MarkdownAstNode): boolean {
  return (
    (node.type === "image" || node.type === "image-block") &&
    isWhiteboardCaption(node.title) &&
    isWhiteboardSource(node.url)
  );
}

export function transformWhiteboardAst(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const node = value as MarkdownAstNode;

  if (
    node.type === "paragraph" &&
    node.children?.length === 1 &&
    node.children[0] &&
    isMarkedWhiteboardImage(node.children[0])
  ) {
    node.type = "whiteboard";
    node.url = node.children[0].url;
    delete node.children;
    return;
  }

  if (node.type === "image-block" && isMarkedWhiteboardImage(node)) {
    node.type = "whiteboard";
    return;
  }

  for (const child of node.children ?? []) transformWhiteboardAst(child);
}
