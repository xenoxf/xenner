import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_APPEARANCE, sanitizeAppearance } from "./appearance.ts";

test("normaliza preferencias de apariencia y limita valores", () => {
  const result = sanitizeAppearance({
    mode: "dark",
    uiFont: "Inter, sans-serif",
    editorFont: "Georgia, serif",
    editorSize: 999,
    lineHeight: 0,
    contentWidth: 10,
  });
  assert.equal(result.mode, "dark");
  assert.equal(result.uiFont, "Inter, sans-serif");
  assert.equal(result.editorFont, "Georgia, serif");
  assert.equal(result.editorSize, 24);
  assert.equal(result.lineHeight, 1.2);
  assert.equal(result.contentWidth, 560);
});

test("rechaza una tipografía que podría romper CSS", () => {
  const result = sanitizeAppearance({ uiFont: "Inter; color: red" });
  assert.equal(result.uiFont, DEFAULT_APPEARANCE.uiFont);
});
