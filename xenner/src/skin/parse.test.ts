import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSkinComponent,
  parseSkinConfig,
  parseSkinManifest,
  parseSkinTxt,
} from "./parse.ts";

test("acepta comentarios, comillas opcionales y la última definición", () => {
  const parsed = parseSkinTxt(
    ['# comentario', 'accent="#111"', 'accent = #222', "text='blanco'"].join("\n"),
  );

  assert.deepEqual(parsed, { accent: "#222", text: "blanco" });
});

test("ignora claves desconocidas por componente", () => {
  const parsed = parseSkinComponent(
    "note",
    ["accent=#fff", "itemActive=red", "textDim=grey"].join("\n"),
  );

  assert.deepEqual(parsed, { accent: "#fff" });
});

test("rechaza valores que pueden romper CSS o cargar recursos", () => {
  const parsed = parseSkinComponent(
    "background",
    [
      "background=red; color: blue",
      "overlay=url(https://example.test/pixel.png)",
      "shadow=expression(alert(1))",
      "text=@import 'remote.css'",
      "accent=javascript:alert(1)",
      "radius=data:text/html,bad",
      "blur=ok",
    ].join("\n"),
  );

  assert.deepEqual(parsed, { blur: "ok" });
});

test("limita la longitud de valores", () => {
  const parsed = parseSkinComponent("background", `text=${"a".repeat(1025)}`);
  assert.deepEqual(parsed, {});
});

test("usa allowlists separadas para manifiesto y config", () => {
  assert.deepEqual(parseSkinManifest('name="X"\naccent="red"'), { name: "X" });
  assert.deepEqual(parseSkinConfig('skinPath="webcore"\nname="X"'), {
    skinPath: "webcore",
  });
});
