import assert from "node:assert/strict";
import test from "node:test";

import { aRgb, esClaro, esquemaDe, mezclar, paletaDesdeColor } from "./palette.ts";

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

test("un color se lee en las tres formas que usan los temas", () => {
  assert.deepEqual(aRgb("#7c3aed"), [124, 58, 237]);
  assert.deepEqual(aRgb("#fff"), [255, 255, 255]);
  assert.deepEqual(aRgb("rgb(10, 20, 30)"), [10, 20, 30]);
  assert.deepEqual(aRgb("rgba(10, 20, 30, 0.4)"), [10, 20, 30]);
  assert.equal(aRgb("url(assets/fondo.jpg)"), null);
  assert.equal(aRgb("linear-gradient(red, blue)"), null);
});

test("el esquema se deduce del color, o se dice que no se sabe", () => {
  assert.equal(esquemaDe("#ffffff"), "light");
  assert.equal(esquemaDe("#202020"), "dark");
  assert.equal(esquemaDe("rgba(32, 32, 32, 1)"), "dark");
  // Sin opinion es mejor que una opinion inventada.
  assert.equal(esquemaDe(""), null);
  assert.equal(esquemaDe("var(--otro)"), null);
  assert.equal(esquemaDe("linear-gradient(red, blue)"), null);
  // Casi transparente deja ver el fondo que tiene debajo: su color no dice nada.
  assert.equal(esquemaDe("rgba(32, 32, 32, 0.1)"), null);
  assert.equal(esquemaDe("rgba(32, 32, 32, 0.9)"), "dark");
});
