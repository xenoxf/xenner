import { $markSchema, $remark } from "@milkdown/kit/utils";

export const DEFAULT_TEXT_COLOR = "#2563eb";

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: {
    color?: string;
  };
}

interface TextColorNode extends MarkdownNode {
  type: "textColor";
  children: MarkdownNode[];
  data: {
    color: string;
  };
}

interface RemarkData {
  toMarkdownExtensions?: unknown[];
}

interface RemarkProcessor {
  data(): RemarkData;
}

interface StringifyState {
  containerPhrasing(node: TextColorNode, options: { before: string; after: string }): string;
}

type TextColorHandler = (
  node: TextColorNode,
  parent: unknown,
  state: StringifyState,
  info: unknown,
) => string;

export const textColorToMarkdown = {
  handlers: {
    textColor: ((node, _parent, state) => {
      const color = normalizeTextColor(node.data?.color) ?? DEFAULT_TEXT_COLOR;
      const before = `<span data-xenner-color="${color}" style="color:${color}">`;
      const content = state.containerPhrasing(node, { before: "", after: "" });
      return `${before}${content}</span>`;
    }) satisfies TextColorHandler,
  },
};

export function normalizeTextColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [red, green, blue] = color.slice(1).toLowerCase();
    return `#${red}${red}${green}${green}${blue}${blue}`;
  }
  return null;
}

function isHtml(node: MarkdownNode): node is MarkdownNode & { value: string } {
  return node.type === "html" && typeof node.value === "string";
}

function colorSpanValue(node: MarkdownNode): string | null {
  if (!isHtml(node)) return null;
  const value = node.value.trim();
  if (!/^<span\b[^>]*>$/i.test(value)) return null;

  const dataColor = /\bdata-xenner-color\s*=\s*(["'])(#[0-9a-f]{3,8})\1/i.exec(value);
  if (dataColor) return normalizeTextColor(dataColor[2]);

  const style = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(value);
  const styleValue = style?.[1] ?? style?.[2];
  if (!styleValue) return null;
  const color = /(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8})/i.exec(styleValue);
  return normalizeTextColor(color?.[1]);
}

function isClosingSpan(node: MarkdownNode): boolean {
  return isHtml(node) && /^<\/span\s*>$/i.test(node.value.trim());
}

function isOpeningSpan(node: MarkdownNode): boolean {
  return isHtml(node) && /^<span\b[^>]*>$/i.test(node.value.trim());
}

function transformTextColorChildren(parent: MarkdownNode): void {
  if (!Array.isArray(parent.children)) return;
  const source = parent.children;
  const transformed: MarkdownNode[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const child = source[index];
    const color = colorSpanValue(child);
    if (!color) {
      transformTextColorChildren(child);
      transformed.push(child);
      continue;
    }

    let depth = 1;
    let closingIndex = index + 1;
    for (; closingIndex < source.length; closingIndex += 1) {
      const candidate = source[closingIndex];
      if (isOpeningSpan(candidate)) depth += 1;
      if (!isClosingSpan(candidate)) continue;
      depth -= 1;
      if (depth === 0) break;
    }
    if (depth !== 0) {
      transformed.push(child);
      continue;
    }

    const children = source.slice(index + 1, closingIndex);
    const marked: TextColorNode = {
      type: "textColor",
      data: { color },
      children,
    };
    transformTextColorChildren(marked);
    transformed.push(marked);
    index = closingIndex;
  }

  parent.children = transformed;
}

export function transformTextColorAst(tree: MarkdownNode): void {
  for (const child of tree.children ?? []) transformTextColorChildren(child);
}

export function remarkTextColor(this: RemarkProcessor) {
  const data = this.data();
  const extensions = data.toMarkdownExtensions ?? [];
  if (!extensions.includes(textColorToMarkdown)) extensions.push(textColorToMarkdown);
  data.toMarkdownExtensions = extensions;
  return transformTextColorAst;
}

export const textColorRemark = $remark("xennerTextColor", () => remarkTextColor);

export const textColorMark = $markSchema("textColor", () => ({
  attrs: {
    color: {
      default: DEFAULT_TEXT_COLOR,
      validate: "string",
    },
  },
  parseDOM: [
    {
      tag: "span[data-xenner-color]",
      getAttrs: (dom) => ({
        color: normalizeTextColor(dom.getAttribute("data-xenner-color")) ?? DEFAULT_TEXT_COLOR,
      }),
    },
  ],
  toDOM: (mark) => {
    const color = normalizeTextColor(mark.attrs.color) ?? DEFAULT_TEXT_COLOR;
    return [
      "span",
      {
        "data-xenner-color": color,
        style: `color:${color}`,
      },
      0,
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === "textColor",
    runner: (state, node, markType) => {
      const color = normalizeTextColor((node as unknown as TextColorNode).data?.color) ?? DEFAULT_TEXT_COLOR;
      state.openMark(markType, { color });
      state.next(node.children ?? []);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "textColor",
    runner: (state, mark) => {
      const color = normalizeTextColor(mark.attrs.color) ?? DEFAULT_TEXT_COLOR;
      state.withMark(mark, "textColor", undefined, { data: { color } });
    },
  },
}));
