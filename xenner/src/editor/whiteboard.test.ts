import assert from "node:assert/strict";
import test from "node:test";

import { createNoteMarkdownManager } from "./markdown/manager.ts";
import {
  isWhiteboardSource,
  shouldShowDrawingPreview,
  WHITEBOARD_CAPTION,
} from "./extensions/whiteboard.ts";

const manager = createNoteMarkdownManager();
const source = "data:image/svg+xml;base64,PHN2Zy8+";
const markdown = `![Pizarra](${source} "xenner:pizarra")`;

/**
 * Decisión: `transformWhiteboardAst` ya no existe, y este archivo no prueba nada
 * del AST de remark porque ya no hay remark.
 *
 * Antes la pizarra se reconocía transformando el árbol de remark: una imagen con
 * el título `xenner:pizarra` se cambiaba de tipo a mano, después de analizar. Con
 * Tiptap el Markdown se analiza con el *tokenizer* de la extensión, y ese
 * tokenizer ya devuelve un token `whiteboard` —que solo es un bloque cuando la
 * línea es exactamente una pizarra—. Convertir el árbol después sería hacer dos
 * veces el mismo trabajo y además tarde: cuando ya se ha elegido el nodo que
 * depende de él.
 */

test("el título de la pizarra es el que la distingue de una imagen", () => {
  assert.equal(WHITEBOARD_CAPTION, "xenner:pizarra");
});

test("solo un SVG en data: es una pizarra", () => {
  assert.equal(isWhiteboardSource(source), true);
  assert.equal(isWhiteboardSource("data:image/svg+xml;base64,"), true);
  assert.equal(isWhiteboardSource("data:image/svg+xml;base64,PD94bWw+PC9zdmc+"), true);
  // Un PNG en base64 es una imagen, aunque lleve el título de pizarra.
  assert.equal(isWhiteboardSource("data:image/png;base64,iVBORw0KGgo="), false);
  assert.equal(isWhiteboardSource(".assets/dibujo.svg"), false);
  assert.equal(isWhiteboardSource("https://x.dev/dibujo.svg"), false);
  assert.equal(isWhiteboardSource(undefined), false);
});

test("la vista previa solo se ve con el lienzo cerrado y con contenido", () => {
  const base = { editing: false, starting: false, hasContent: true };
  assert.equal(shouldShowDrawingPreview(base), true, "dibujo guardado y cerrado");

  // Editar un dibujo NO puede dejar su imagen encima: el lienzo se incrusta en
  // el mismo nodo y aparecería por debajo en lugar de en su lugar.
  assert.equal(shouldShowDrawingPreview({ ...base, editing: true }), false);
  assert.equal(shouldShowDrawingPreview({ ...base, starting: true }), false);
  // Un borrador recién creado no debe dejar un tablero en blanco de 320x200.
  assert.equal(shouldShowDrawingPreview({ ...base, hasContent: false }), false);
  assert.equal(
    shouldShowDrawingPreview({ editing: true, starting: false, hasContent: false }),
    false,
  );
});

test("el Markdown de la pizarra entra como nodo y sale igual", () => {
  const doc = manager.parse(markdown);
  assert.deepEqual(doc, {
    type: "doc",
    content: [
      {
        type: "whiteboard",
        attrs: { src: source, tool: "select", draft: false, drawingId: "" },
      },
    ],
  });
  assert.equal(manager.serialize(doc), markdown);
});

test("la pizarra sobrevive entre los demás bloques", () => {
  const nota = `antes\n\n${markdown}\n\ndespués`;
  const doc = manager.parse(nota);
  assert.deepEqual(
    (doc.content ?? []).map((nodo) => nodo.type),
    ["paragraph", "whiteboard", "paragraph"],
  );
  assert.equal(manager.serialize(doc), nota);
});

test("una imagen que dice ser pizarra pero no lo es se queda como imagen", () => {
  // Un `.svg` suelto no se puede editar en un lienzo: enseñarlo como imagen es
  // la degradation honesta, y deja la referencia a la vista en vez de perderla.
  const doc = manager.parse('![Pizarra](.assets/dibujo.svg "xenner:pizarra")');
  assert.deepEqual(doc, {
    type: "doc",
    content: [
      {
        type: "noteImage",
        attrs: { src: ".assets/dibujo.svg", alt: "Pizarra", title: "xenner:pizarra" },
      },
    ],
  });
});

test("una imagen normal no se vuelve pizarra", () => {
  const nota = `![Un pie](${source})`;
  const doc = manager.parse(nota);
  assert.equal((doc.content ?? [])[0]?.type, "noteImage");
  assert.equal(manager.serialize(doc), nota);
});

test("una pizarra sin dibujo guardado sigue siendo una pizarra", () => {
  /**
   * El serializador escribe una pizarra sin `src` como `![Pizarra](
   * "xenner:pizarra")`. Si el tokenizador no supiera leerla, al abrir la nota el
   * bloque se convertía en una imagen rota cuyo `src` era el texto literal
   * `"xenner:pizarra"` — el dibujo se perdía para siempre, y el segundo guardado
   * ya escribía otra cosa distinta.
   */
  const borrador = {
    type: "doc",
    content: [{ type: "whiteboard", attrs: { src: "", tool: "select", draft: true, drawingId: "" } }],
  };
  const md = manager.serialize(borrador as never);
  assert.equal(md, '![Pizarra]( "xenner:pizarra")');

  const doc = manager.parse(md);
  assert.deepEqual(doc.content?.[0], {
    type: "whiteboard",
    attrs: { src: "", tool: "select", draft: true, drawingId: "" },
  });
  // Y dar la vuelta otra vez no mueve nada.
  assert.equal(manager.serialize(doc), md);
});

test("un SVG vacío cuenta como pizarra con dibujo guardado", () => {
  const vacio = "data:image/svg+xml;base64,";
  const nota = `![Pizarra](${vacio} "xenner:pizarra")`;
  const doc = manager.parse(nota);
  assert.deepEqual(doc.content?.[0]?.attrs, {
    src: vacio,
    tool: "select",
    draft: false,
    drawingId: "",
  });
  assert.equal(manager.serialize(doc), nota);
});