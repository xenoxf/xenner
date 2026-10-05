import assert from "node:assert/strict";
import test from "node:test";

import { searchSettings, SETTINGS_SECTIONS, SETTINGS_SEARCH, sectionDe } from "./settings.ts";

/**
 * El buscador de la configuración.
 *
 * Lo que se comprueba aquí es lo que no se ve: que **todo** ajuste tenga su entrada.
 * Un buscador que arranca el DOM para ver qué botones hay se rompe en cuanto
 * alguien escribe un `<For>` y, peor, no encuentra nada que no sea un texto suelto.
 * Con la lista a la vista, el olvido es una línea que falta —y aquí se ve— en vez de
 * un botón invisible.
 */

test("toda sección tiene descripción y palabras clave", () => {
  for (const seccion of SETTINGS_SECTIONS) {
    assert.ok(seccion.description.length > 0, `${seccion.id}: sin descripción`);
    assert.ok(seccion.keywords.length > 0, `${seccion.id}: sin palabras clave`);
  }
});

test("cada ajuste de la lista apunta a una sección que existe", () => {
  for (const item of SETTINGS_SEARCH) {
    assert.ok(
      SETTINGS_SECTIONS.some((seccion) => seccion.id === item.section),
      `${item.label}: apunta a la sección «${item.section}», que no existe`,
    );
    assert.ok(item.label.length > 0, "un resultado sin nombre no se puede leer");
    assert.ok(item.description.length > 0, `${item.label}: sin explicación`);
  }
});

test("sin escribir no hay resultados, y la navegación sigue siendo la de siempre", () => {
  // Vacío **no** es «nada»: es «no estás buscando». Si devolviera la lista entera,
  // el modal tendría que pintar los ajustes de otra forma al borrar la búsqueda.
  assert.deepEqual(searchSettings(""), []);
  assert.deepEqual(searchSettings("   "), []);
});

test("buscar encuentra por nombre, por explicación y por palabra clave", () => {
  const porNombre = searchSettings("interlineado").map((item) => item.label);
  assert.deepEqual(porNombre, ["Interlineado"]);

  // «hueco» solo está en la explicación de la tipografía del editor.
  const porExplicacion = searchSettings("horas").map((item) => item.label);
  assert.deepEqual(porExplicacion, ["Tipografía del editor"]);

  // «paleta» es una palabra clave de dos.
  assert.ok(searchSettings("paleta").length >= 2);
});

test("buscar ignora tildes y mayúsculas", () => {
  // En un panel de ajustes se escribe como se habla: «TIPOGRAFIA» tiene que encontrar
  // «Tipografía» y al revés.
  assert.deepEqual(
    searchSettings("tipografia").map((item) => item.label),
    searchSettings("Tipografía").map((item) => item.label),
  );
  assert.equal(searchSettings("oscuro").length, searchSettings("OSCURO").length);
  assert.ok(searchSettings("oscuro").length > 0);
});

test("todas las palabras tienen que aparecer, no solo una", () => {
  // Es lo que hace que escribir de más devuelva «nada» en vez de una lista que no
  // tiene nada que ver: es menos mágico y se entiende.
  assert.deepEqual(searchSettings("tamaño oscuro"), []);
  assert.ok(searchSettings("tamaño texto").length >= 1);
});

test("una palabra que no está en ninguna parte no encuentra nada", () => {
  assert.deepEqual(searchSettings("zzzz"), []);
});

test("la sección que se pide es la de la lista, y nunca `undefined`", () => {
  for (const seccion of SETTINGS_SECTIONS) {
    assert.equal(sectionDe(seccion.id).id, seccion.id);
  }
});