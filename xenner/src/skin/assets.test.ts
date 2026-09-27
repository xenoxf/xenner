import assert from "node:assert/strict";
import test from "node:test";

import { collectUrlReferences, resolveSkinUrls } from "./assets.ts";

test("recoge las referencias url() y descarta las que ya son data:", () => {
  const references = collectUrlReferences(
    [
      'a { background: url(assets/fondo.png); }',
      'b { background: url("assets/otro.jpg"); }',
      "c { background: url(assets/tercero.webp); }",
      'd { background: url(data:image/png;base64,AAAA); }',
      "e { background: url( assets/ya-espaciado.png ) center; }",
    ].join("\n"),
  );

  assert.deepEqual(references, [
    "assets/fondo.png",
    "assets/otro.jpg",
    "assets/tercero.webp",
    "assets/ya-espaciado.png",
  ]);
});

test("sustituye cada ruta por su data URL", async () => {
  const css = [
    'a { background-image: url(assets/fondo.png); }',
    'b { mask-image: url(assets/icono.svg); }',
  ].join("\n");

  const resolved = await resolveSkinUrls(css, {
    fetchAsset: async (path) =>
      path === "assets/fondo.png" ? "data:image/png;base64,PNG" : "data:image/svg+xml,SVG",
  });

  assert.equal(
    resolved,
    'a { background-image: url("data:image/png;base64,PNG"); }\n' +
      'b { mask-image: url("data:image/svg+xml,SVG"); }',
  );
});

test("una imagen que falta no rompe el resto del CSS", async () => {
  // Lo que no se puede resolver se deja tal cual: el navegador la ignora y la
  // superficie conserva su aspecto por defecto. Perder una imagen siempre es
  // mejor que dejar un componente sin estilo.
  const css = "a { background: url(assets/falta.png); color: red; } b { color: blue; }";
  const missing: string[] = [];

  const resolved = await resolveSkinUrls(css, {
    fetchAsset: async () => null,
    onMissing: (path) => missing.push(path),
  });

  assert.equal(resolved, css);
  assert.deepEqual(missing, ["assets/falta.png"]);
});

test("pide cada imagen una sola vez aunque se repita", async () => {
  let calls = 0;
  const css = [
    "a { background: url(assets/logo.png); }",
    "b { border-image: url(assets/logo.png); }",
    "c { mask: url(assets/logo.png); }",
  ].join("\n");

  await resolveSkinUrls(css, {
    fetchAsset: async () => {
      calls += 1;
      return "data:image/png;base64,PNG";
    },
  });

  assert.equal(calls, 1);
});

test("un texto sin url() no se toca", async () => {
  const css = ":root { --skin-note-background: #202020; }";
  const resolved = await resolveSkinUrls(css, {
    fetchAsset: async () => {
      throw new Error("no debería llamarse");
    },
  });
  assert.equal(resolved, css);
});
