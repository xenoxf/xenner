import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SKIN_DRAFT } from "../data/skin.ts";
import { buildSkinComponents, buildSkinPreviewStyle, slugifySkinId } from "./creator.ts";

test("convierte el nombre de una skin en un identificador portable", () => {
  assert.equal(slugifySkinId("Mi skin bonita"), "mi-skin-bonita");
  assert.equal(slugifySkinId("  ¡Ñandú!  "), "nandu");
  assert.equal(slugifySkinId("---"), "mi-skin");
});

test("el creador produce una paleta amplia y valores seguros", () => {
  const components = buildSkinComponents({
    ...DEFAULT_SKIN_DRAFT,
    name: "Test",
    accent: "#6750a4",
    background: "#101014",
    surface: "#181820",
    panel: "#22222c",
    text: "#f4f0ff",
    textDim: "#aaa0c0",
    border: "#4a405d",
    hover: "#30283e",
    active: "#4b3670",
    radius: 16,
    blur: 12,
    borderWidth: 2,
    shadow: "strong",
    font: "serif",
  });
  assert.ok(components.background);
  assert.equal(components.sidebar.textDim, "#aaa0c0");
  assert.equal(components.button.radius, "16px");
  assert.equal(components.note.blur, "12px");
  assert.equal(components.note.border, "2px solid #4a405d");
  assert.equal(components.background.accent, "#6750a4");
  assert.equal(components.toolbar.font.includes(";"), false);
  assert.match(buildSkinPreviewStyle(DEFAULT_SKIN_DRAFT), /--skin-note-background:/);
});

test("el creador cae en valores seguros si recibe colores inválidos", () => {
  const components = buildSkinComponents({
    ...DEFAULT_SKIN_DRAFT,
    accent: "red; color: blue",
    background: "url(https://example.invalid)",
  });
  assert.equal(components.background.accent, DEFAULT_SKIN_DRAFT.accent);
  assert.equal(components.background.background, DEFAULT_SKIN_DRAFT.background);
});
