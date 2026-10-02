/**
 * Lo que el editor hace cuando se le pide insertar algo.
 *
 * Este archivo es la reacción directa al aviso de que «al pulsar el + desaparece
 * todo». Los tests que había leían el código como texto y no ejecutaban nada, así
 * que no podían ver un fallo que depende de lo que ProseMirror haga con la
 * transacción. Aquí se ejecuta de verdad: `editor-harness.ts` monta el Milkdown
 * de Milkdown —su esquema, sus comandos y su serializador de Markdown— sin
 * navegador, y se comprueba el documento y el Markdown que salen después.
 *
 * El error más caro que se ha encontrado por aquí no lo ha dado ninguno de estos
 * caminos, sino un **`tr.replaceWith` con los nodos extendidos**: la función solo
 * mira el tercer argumento, así que se quedaba con el primero y **el resto del
 * texto del bloque se perdía**. Por eso `editor-harness.ts` trae `validar()` y
 * todos estos tests terminan exigiendo que el texto de la nota siga entero.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  focusTextCursor,
  insertAttachmentLink,
  leaveCaretBehind,
} from "./editor-commands.ts";
import { ORDEN_DEL_ESQUEMA, crearEditorDePrueba } from "./editor-harness.ts";

type Editor = Awaited<ReturnType<typeof crearEditorDePrueba>>;

const parrafo = (texto: string) => ({
  type: "paragraph",
  content: [{ type: "text", text: texto }],
});

/**
 * Los fallos que recoge cada prueba.
 *
 * Cada prueba tiene los suyos: si el registro fuera de todo el archivo, un
 * fallo de la primera aparecería en las de después y noneería dónde está.
 */
function registra() {
  const fallos: string[] = [];
  return {
    fallos,
    report(que: string, error: unknown) {
      fallos.push(`${que} — ${error instanceof Error ? error.message : String(error)}`);
    },
  };
}

test("adjuntar un archivo deja una línea con el enlace y el texto sigue entero", async () => {
  const { fallos, report } = registra();
  // El gesto va en su propia línea porque es como se lee: si el cursor estaba a
  // media frase, partir el bloque deja la frase arriba y el adjunto debajo.
  const editor = await crearEditorDePrueba([parrafo("Frase"), parrafo("Otra")]);
  editor.cursorEn("Frase");
  assert.equal(insertAttachmentLink(editor.ctx, editor.view, "./.assets/Informe.pdf", "Informe.pdf", report), true);
  editor.validar();
  assert.deepEqual(fallos, []);
  assert.match(editor.markdown(), /\[Informe\.pdf\]\(\.\/\.assets\/Informe\.pdf\)/);
  // Y no se ha perdido ni una palabra de lo que ya estaba escrito.
  assert.equal(editor.texto().split("\n").join(" ").trim(), "Frase Informe.pdf Otra");
});

test("adjuntar con texto seleccionado sustituye el texto, que es lo que se pidió", async () => {
  const { fallos, report } = registra();
  // Adjuntar encima de un texto significa que ese texto era el nombre del
  // archivo. Es lo único que se come texto a propósito, y solo aquí.
  const editor = await crearEditorDePrueba([parrafo("Nombre viejo"), parrafo("Otra")]);
  editor.seleccionar("Nombre viejo");
  assert.equal(insertAttachmentLink(editor.ctx, editor.view, "./.assets/a.pdf", "a.pdf", report), true);
  editor.validar();
  assert.deepEqual(fallos, []);
  assert.equal(editor.texto().split("\n").join(" ").trim(), "a.pdf Otra");
});

test("adjuntar varias veces seguidas va apilando en orden y no pierde texto", async () => {
  const { fallos, report } = registra();
  // El cursor se queda en la línea del adjunto, así que el siguiente va detrás.
  // Cada adjunto tiene que abrir su propia línea: si el segundo se comiera el
  // texto que ya había, el fallo se vería aquí y no en la nota de alguien.
  const editor = await crearEditorDePrueba([parrafo("Frase")]);
  editor.cursorEn("Frase");
  for (const nombre of ["uno.pdf", "dos.pdf", "tres.pdf"]) {
    assert.equal(
      insertAttachmentLink(editor.ctx, editor.view, `./.assets/${nombre}`, nombre, report),
      true,
      `falló ${nombre}`,
    );
  }
  editor.validar();
  assert.deepEqual(fallos, []);
  assert.equal(editor.texto().split("\n").join(" ").trim(), "Frase uno.pdf dos.pdf tres.pdf");
});

test("un fallo al adjuntar se avisa y no deja la vista a medias", async () => {
  const { fallos, report } = registra();
  const editor = await crearEditorDePrueba([parrafo("Frase")]);
  editor.cursorEn("Frase");
  // Una ruta que el esquema de enlaces no puede sostener.
  const ok = insertAttachmentLink(editor.ctx, editor.view, "", "", report);
  editor.validar();
  if (!ok) {
    assert.equal(fallos.length, 1, "un fallo sin avisar parece un botón roto");
    assert.match(fallos[0], /enlace al archivo/);
  }
  assert.match(editor.markdown(), /Frase/, "el texto de la nota no puede desaparecer");
});

test("el cursor vuelve al texto cuando el editor no tiene una selección de texto", async () => {
  const { fallos, report } = registra();
  // Insertar desde el dock llega sin cursor de texto, porque el botón está fuera
  // del `contenteditable`. Sin esto el bloque caía al final de la nota.
  const editor = await crearEditorDePrueba([parrafo("Primero"), parrafo("Segundo")]);
  editor.cursorEn("Segundo");
  const ultima = editor.estado().selection.from;
  focusTextCursor(editor.view, ultima, report);
  editor.validar();
  assert.deepEqual(fallos, []);
  assert.equal(editor.texto().split("\n").join(" ").trim(), "Primero Segundo");
});

test("soltar el cursor detrás deja el cursor en el sitio y el texto entero", async () => {
  const { fallos, report } = registra();
  // Cambiar el tipo y seguir escribiendo sustituye el texto entero si la
  // selección se queda puesta. Soltarla es lo que evita ese regalo.
  const editor = await crearEditorDePrueba([parrafo("Linea"), parrafo("Otra")]);
  editor.seleccionar("Linea");
  leaveCaretBehind(editor.view, report);
  editor.validar();
  assert.deepEqual(fallos, []);
  assert.equal(editor.estado().selection.empty, true, "la selección tiene que estar suelta");
  assert.equal(editor.texto().split("\n").join(" ").trim(), "Linea Otra");
});

test("el esquema que monta el arnés es el de Milkdown y está completo", async () => {
  const { fallos, report } = registra();
  // Si Milkdown añade un nodo y la lista no lo recoge, el esquema se monta a
  // medias y los fallos que salen son de otra cosa. La lista es de
  // `preset-commonmark/src/composed/schema.ts`; `headingIdGenerator` no se
  // exporta, y por eso el puente del arnés le da un valor por defecto.
  const commonmark = await import("@milkdown/kit/preset/commonmark");
  const schemas = Object.keys(commonmark).filter((nombre) => /Schema$/.test(nombre));
  const faltan = schemas.filter((nombre) => !ORDEN_DEL_ESQUEMA.includes(nombre));
  assert.deepEqual(faltan, [], `el arnés no registra: ${faltan.join(", ")}`);

  const editor = await crearEditorDePrueba([parrafo("Linea")]);
  editor.validar();
  assert.equal(editor.markdown(), "Linea\n");
});