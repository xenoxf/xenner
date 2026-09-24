import assert from "node:assert/strict";
import test from "node:test";

import { buildSkinComponents, slugifySkinId } from "./creator.ts";

test("convierte el nombre de una skin en un identificador portable", () => {
  assert.equal(slugifySkinId("Mi skin bonita"), "mi-skin-bonita");
  assert.equal(slugifySkinId("  ¡Ñandú!  "), "nandu");
  assert.equal(slugifySkinId("---"), "mi-skin");
});

test("el creador produce componentes permitidos y valores seguros", () => {
  const components = buildSkinComponents({
    name: "Test",
    accent: "#6750a4",
    mode: "dark",
    radius: 16,
    font: "system",
  });
  assert.ok(components.background);
  assert.ok(components.sidebar.textDim);
  assert.equal(components.button.radius, "16px");
  assert.equal(components.background.accent, "#6750a4");
  assert.equal(components.toolbar.font.includes(";"), false);
});
