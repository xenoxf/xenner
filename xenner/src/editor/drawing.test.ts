import assert from "node:assert/strict";
import test from "node:test";

import { drawingFromDataUrl, drawingToDataUrl, serializeDrawing } from "./drawing.ts";

test("serializa una pizarra vacía como SVG seguro", () => {
  const svg = serializeDrawing([]);
  assert.match(svg, /^<svg/);
  assert.match(svg, /viewBox="0 0 1000 600"/);
  assert.match(svg, /data-xenner-asset="safe"/);
});

test("convierte el SVG a un data URL seguro", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Texto ñ</text></svg>';
  const dataUrl = drawingToDataUrl(svg);
  assert.ok(dataUrl.startsWith("data:image/svg+xml;base64,"));
  assert.equal(drawingFromDataUrl(dataUrl), svg);
});
