import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_SIDEBAR_LAYOUT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  clampSidebarWidth,
  maxSidebarWidthFor,
  sanitizeSidebarLayout,
  sidebarWidthStyle,
  sidebarWidthVariable,
} from "./sidebarLayout.ts";

/**
 * Lo que se comprueba aquí es lo que se puede romper en silencio: que un ancho
 * guardado a mano —o de una ventana muy estrecha— no deje el panel con cinco
 * píxeles, y que sin ancho guardado no se escriba nada en el `style`, porque
 * ese nada es lo que deja mandar al `clamp()` de la hoja CSS.
 */

test("el ancho se acota entre el mínimo y el máximo", () => {
  assert.equal(clampSidebarWidth(10), SIDEBAR_WIDTH_MIN);
  assert.equal(clampSidebarWidth(99999), SIDEBAR_WIDTH_MAX);
  assert.equal(clampSidebarWidth(280), 280);
  assert.equal(clampSidebarWidth(280.4), 280, "los píxeles son enteros");
});

test("el tope depende de lo que mide la ventana, no del máximo de siempre", () => {
  // Con el panel estirado, al editor le quedan 320 px como mínimo.
  assert.equal(maxSidebarWidthFor(1400), SIDEBAR_WIDTH_MAX);
  assert.equal(maxSidebarWidthFor(700), 380);
  // En una ventana tan estrecha que no cabe ni el mínimo, manda el mínimo.
  assert.equal(maxSidebarWidthFor(300), SIDEBAR_WIDTH_MIN);
  assert.equal(maxSidebarWidthFor(Number.NaN), SIDEBAR_WIDTH_MAX);
});

test("arrastrar en una ventana estrecha no aplasta el editor", () => {
  assert.equal(clampSidebarWidth(99999, maxSidebarWidthFor(700)), 380);
  assert.equal(clampSidebarWidth(400, maxSidebarWidthFor(700)), 380);
});

test("un ancho que no es un número no mueve el panel de sitio", () => {
  assert.equal(clampSidebarWidth(Number.NaN), SIDEBAR_WIDTH_MIN);
  assert.equal(clampSidebarWidth(Number.POSITIVE_INFINITY), SIDEBAR_WIDTH_MIN);
});

test("lo que venga de localStorage se sanea antes de usarse", () => {
  assert.deepEqual(sanitizeSidebarLayout({ open: false, width: 900 }), {
    open: false,
    width: SIDEBAR_WIDTH_MAX,
  });
  assert.deepEqual(
    sanitizeSidebarLayout({ open: "sí", width: "300" }),
    DEFAULT_SIDEBAR_LAYOUT,
    "lo que no es del tipo esperado se cae al valor por defecto",
  );
  assert.deepEqual(sanitizeSidebarLayout(null), DEFAULT_SIDEBAR_LAYOUT);
  assert.deepEqual(sanitizeSidebarLayout("nada"), DEFAULT_SIDEBAR_LAYOUT);
});

test("sin ancho guardado no se escribe nada en el estilo", () => {
  assert.equal(sidebarWidthStyle({ open: true, width: null }), undefined);
  assert.equal(sidebarWidthVariable(null), undefined);
  assert.equal(
    sidebarWidthStyle({ open: true, width: 300 }),
    "--sidebar-width: 300px",
  );
  assert.equal(sidebarWidthVariable(300), "--sidebar-width: 300px");
});

test("guardar y leer devuelve el layout tal cual", () => {
  const guardado = { open: false, width: 320 };
  assert.deepEqual(sanitizeSidebarLayout(guardado), guardado);
});