import assert from "node:assert/strict";
import test from "node:test";

import { esClaro, mezclar, paletaDesdeColor } from "./palette.ts";

test("mezclar dos colores a partes iguales da su punto medio", () => {
  assert.equal(mezclar("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mezclar("#ff0000", "#0000ff", 0), "#ff0000");
  assert.equal(mezclar("#ff0000", "#0000ff", 1), "#0000ff");
});

test("un color ilegible se queda como estaba, sin NaN", () => {
  assert.equal(mezclar("none", "#ffffff", 0.5), "none");
});

test("la paleta derivada tiene los nueve colores y son hex", () => {
  for (const mode of ["light", "dark"] as const) {
    const paleta = paletaDesdeColor(mode, "#6750a4");
    for (const valor of Object.values(paleta)) {
      assert.match(valor, /^#[0-9a-f]{6}$/i);
    }
  }
});

test("el color principal manda en el acento, y el fondo le obedece", () => {
  const paleta = paletaDesdeColor("dark", "#7c3aed");
  assert.match(paleta.accent, /^#[0-9a-f]{6}$/i);
  assert.notEqual(paleta.background, "#151515");
  const clara = paletaDesdeColor("light", "#7c3aed");
  assert.match(clara.accent, /^#[0-9a-f]{6}$/i);
});

test("un color principal que no se entiende cae en el de fábrica", () => {
  const paleta = paletaDesdeColor("dark", "morado");
  assert.equal(paleta.accent, "#5b9bd5");
});

test("es claro separa fondos claros de fondos oscuros", () => {
  assert.equal(esClaro("#ffffff"), true);
  assert.equal(esClaro("#101010"), false);
});
