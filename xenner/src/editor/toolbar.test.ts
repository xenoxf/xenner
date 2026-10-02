import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * El mini menú de formato tiene que estar visible y funcionar.
 *
 * Nació de un bug real: la barra flotante de Crepe se tapaba con `opacity: 0`
 * salvo que el puntero estuviera encima del texto seleccionado. Con el teclado
 * (Mayús flechas, doble clic, Ctrl+A) el puntero no se mueve, la barra no salía
 * nunca, y no había forma de poner negrita, cursiva o un título a lo
 * seleccionado. Con el ratón era una lotería, y además la barra invisible
 * seguía encima del texto cogiendo clics.
 *
 * Estos tests miran el CSS y el componente como texto, que es la única forma de
 * vigilarlo sin un navegador. No comprueban que la barra funcione: comprueban
 * que nadie vuelva a esconderla.
 */

const CSS = readFileSync(
  new URL("../styles/components/MarkdownEditor.module.css", import.meta.url),
  "utf-8",
);
const COMPONENT = readFileSync(
  new URL("../components/editor/MarkdownEditor.tsx", import.meta.url),
  "utf-8",
);

test("el mini menú no se esconde", () => {
  // Ni transparente, ni con `visibility`, ni apagado por un atributo propio.
  assert.ok(
    !/\.milkdown-toolbar[^{]*\{[^}]*opacity:\s*0/.test(CSS),
    "el mini menú se vuelve a tapar con opacity: 0: deja de poder usarse con el teclado",
  );
  assert.ok(
    !/\.milkdown-toolbar[^{]*\{[^}]*visibility:\s*hidden/.test(CSS),
    "el mini menú se vuelve a esconder con visibility: hidden",
  );
  assert.ok(
    !/\.milkdown-toolbar[^{]*\{[^}]*pointer-events:\s*none/.test(CSS),
    "el mini menú no puede recibir clics: pointer-events está apagado",
  );
});

test("el mini menú no depende de por dónde esté el puntero", () => {
  assert.ok(
    !CSS.includes('data-toolbar'),
    "la visibilidad del mini menú depende otra vez de un atributo que pone el puntero",
  );
  assert.ok(
    !COMPONENT.includes("toolbarHover"),
    "el componente vuelve a calcular si el puntero está sobre el texto seleccionado",
  );
  assert.ok(
    !COMPONENT.includes("selectionRect"),
    "el componente vuelve a medir la selección para decidir si se muestra la barra",
  );
});

test("el mini menu conserva los dos botones propios de Xenner", () => {
  // El `buildToolbar` de Crepe se llama DESPUÉS de añadir sus grupos, así que
  // esto no quita ni la negrita ni los títulos: los añade. Lo que sí hay que
  // vigilar es que los dos botones de color no desaparezcan.
  assert.match(COMPONENT, /addItem\(\s*"text-color"/);
  assert.match(COMPONENT, /addItem\(\s*"text-background"/);
});
