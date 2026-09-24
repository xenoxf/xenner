import { $nodeSchema, $remark } from "@milkdown/kit/utils";

import {
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
        return {
          src: dom.dataset.src ?? "",
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
      state.addNode(type, {
        src: typeof node.url === "string" ? node.url : "",
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
        alt: "1.00",
      });
      state.closeNode();
    },
  },
}));
