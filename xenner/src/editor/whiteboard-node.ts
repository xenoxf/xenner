import { $nodeSchema, $remark } from "@milkdown/kit/utils";

import {
  isWhiteboardSource,
  transformWhiteboardAst,
  WHITEBOARD_CAPTION,
} from "./whiteboard";

export const whiteboardRemark = $remark(
  "xennerWhiteboardRemark",
  () => () => transformWhiteboardAst,
);

export const whiteboardNode = $nodeSchema("whiteboard", () => ({
  inline: false,
  group: "block",
  selectable: true,
  draggable: true,
  isolating: true,
  marks: "",
  atom: true,
  attrs: {
    src: { default: "", validate: "string" },
    tool: { default: "select", validate: "string" },
    draft: { default: false, validate: "boolean" },
  },
  parseDOM: [
    {
      tag: 'div[data-type="whiteboard"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        const src = dom.dataset.src ?? "";
        if (!isWhiteboardSource(src)) return false;
        return {
          src,
          tool: dom.dataset.tool ?? "select",
          draft: dom.dataset.draft === "true",
        };
      },
    },
  ],
  toDOM: (node) => [
    "div",
    {
      "data-type": "whiteboard",
      "data-src": node.attrs.src,
      "data-tool": node.attrs.tool,
      "data-draft": String(node.attrs.draft),
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === "whiteboard",
    runner: (state, node, type) => {
      const src = typeof node.url === "string" ? node.url : "";
      if (!isWhiteboardSource(src)) return;
      state.addNode(type, {
        src,
        tool: "select",
        draft: false,
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "whiteboard",
    runner: (state, node) => {
      state.openNode("paragraph");
      state.addNode("image", undefined, undefined, {
        title: WHITEBOARD_CAPTION,
        url: node.attrs.src,
        alt: "Pizarra",
      });
      state.closeNode();
    },
  },
}));
