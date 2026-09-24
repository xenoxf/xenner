import assert from "node:assert/strict";
import test from "node:test";

import {
  transformWhiteboardAst,
  WHITEBOARD_CAPTION,
} from "./whiteboard.ts";

test("convierte solo la imagen marcada como pizarra", () => {
  const tree = {
    type: "root",
    children: [
      { type: "image", title: WHITEBOARD_CAPTION, url: "pizarra.svg" },
      { type: "image-block", title: WHITEBOARD_CAPTION, url: "otra.svg" },
      { type: "image-block", title: "Foto", url: "foto.png" },
    ],
  };
  transformWhiteboardAst(tree);
  assert.equal(tree.children[0].type, "whiteboard");
  assert.equal(tree.children[1].type, "whiteboard");
  assert.equal(tree.children[2].type, "image-block");
});
