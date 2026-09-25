import assert from "node:assert/strict";
import test from "node:test";

import {
  transformWhiteboardAst,
  WHITEBOARD_CAPTION,
} from "./whiteboard.ts";

const source = "data:image/svg+xml;base64,PHN2Zy8+";

test("reemplaza una imagen Markdown independiente por el nodo pizarra", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [{ type: "image", title: WHITEBOARD_CAPTION, url: source }],
      },
      {
        type: "image-block",
        title: WHITEBOARD_CAPTION,
        url: source,
      },
    ],
  };

  transformWhiteboardAst(tree);

  assert.equal(tree.children[0].type, "whiteboard");
  assert.equal(tree.children[0].url, source);
  assert.equal(tree.children[0].children, undefined);
  assert.equal(tree.children[1].type, "whiteboard");
});

test("no convierte imágenes normales, inline ni sources no locais", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "Antes " },
          { type: "image", title: WHITEBOARD_CAPTION, url: source },
        ],
      },
      {
        type: "paragraph",
        children: [{ type: "image", title: WHITEBOARD_CAPTION, url: "pizarra.svg" }],
      },
    ],
  };

  transformWhiteboardAst(tree);

  assert.equal(tree.children[0].type, "paragraph");
  assert.equal(tree.children[0].children[1].type, "image");
  assert.equal(tree.children[1].type, "paragraph");
  assert.equal(tree.children[1].children[0].type, "image");
});
