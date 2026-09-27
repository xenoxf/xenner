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

test("admite imágenes, SVG y datos incrustados", () => {
  // Antes estos cuatro se rechazaban. El bloqueo era una decisión heredada del
  // "un valor = un color", no una necesidad: un `data:` de imagen en un hueco CSS
  // se decodifica como píxeles, sin documento ni script.
  const parsed = parseSkinComponent(
    "background",
    [
      'background="url(assets/fondo.png)"',
      'overlay="url(assets/iconos/hoja.svg)"',
      'text="url(data:image/png;base64,iVBORw0KGgo=)"',
      'border="url(assets/borde.png) 8 24 8 24 / 8px round"',
      'shadow="0 0 20px url(assets/luz.png)"',
    ].join("\n"),
  );

  assert.deepEqual(parsed, {
    background: "url(assets/fondo.png)",
    overlay: "url(assets/iconos/hoja.svg)",
    text: "url(data:image/png;base64,iVBORw0KGgo=)",
    border: "url(assets/borde.png) 8 24 8 24 / 8px round",
    shadow: "0 0 20px url(assets/luz.png)",
  });
});

test("no deja que un url() escape de la carpeta de la skin", () => {
  const parsed = parseSkinComponent(
    "background",
    [
      'background="url(/etc/passwd)"',
      'overlay="url(//evil.test/x.png)"',
      'text="url(../../fuera.png)"',
      'border="url(C:\\\\Windows\\\\win.ini)"',
      'radius="url(data:text/html,<script>)"',
      'blur="ok"',
    ].join("\n"),
  );

  assert.deepEqual(parsed, { blur: "ok" });
});

test("el ; de un data: no rompe el valor", () => {
  // `data:image/png;base64,` lleva un punto y coma legítimo. Rechazarlo sin
  // mirar dónde estaba fue un bug real: ninguna imagen incrustada pasaba.
  const parsed = parseSkinComponent("note", 'background="url(data:image/svg+xml,%3Csvg%3E)"');
  assert.deepEqual(parsed, { background: "url(data:image/svg+xml,%3Csvg%3E)" });
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
