import assert from "node:assert/strict";
import test from "node:test";

import type { EditorState } from "@tiptap/pm/state";

import { crearEditorDePrueba } from "./editor-harness.ts";
import { blockTypesInSelection } from "./block-type.ts";

/**
 * El botón de estilo tiene que decir la verdad.
 *
 * Nació de un bug real: `nodesBetween` entrega la posición **antes** del bloque,
 * no dentro. Resolver en esa posición cae en el nodo anterior, así que con el
 * cursor dentro de un `##` se leía «Texto» y el botón de título no se marcaba:
 * el menú mentía sobre lo que había debajo del cursor.
 *
 * Estos tests lo ejecutan contra un documento de verdad, con las posiciones que
 * de verdad salen, en vez de contra un documento inventado donde `resolve` hacía
 * lo que le pedían.
 */

test("el cursor dentro de un título marca ese título", async () => {
  const editor = await crearEditorDePrueba([
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hola" }] },
    { type: "paragraph", content: [{ type: "text", text: "Mundo" }] },
  ]);
  // Posición real del texto del título, leída del documento ya construido.
  let dentro = 0;
  editor.estado().doc.descendants((nodo, posicion) => {
    if (nodo.isText && nodo.text === "Hola") dentro = posicion + 2;
    return undefined;
  });

  assert.deepEqual([...blockTypesInSelection(editor.estado().doc, dentro, dentro)], ["heading2"]);
});

test("el cursor dentro de un párrafo marca texto", async () => {
  const editor = await crearEditorDePrueba([
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hola" }] },
    { type: "paragraph", content: [{ type: "text", text: "Mundo" }] },
  ]);
  let dentro = 0;
  editor.estado().doc.descendants((nodo, posicion) => {
    if (nodo.isText && nodo.text === "Mundo") dentro = posicion + 3;
    return undefined;
  });

  assert.deepEqual([...blockTypesInSelection(editor.estado().doc, dentro, dentro)], ["paragraph"]);
});

test("un elemento de lista se lee como lista, no como texto suelto", async () => {
  const editor = await crearEditorDePrueba([
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          attrs: { label: "•", listType: "bullet", spread: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Uno" }] }],
        },
      ],
    },
  ]);
  let dentro = 0;
  editor.estado().doc.descendants((nodo, posicion) => {
    if (nodo.isText && nodo.text === "Uno") dentro = posicion + 1;
    return undefined;
  });

  assert.deepEqual([...blockTypesInSelection(editor.estado().doc, dentro, dentro)], ["bullet"]);
});

test("una cita se lee como cita, no como el párrafo de dentro", async () => {
  const editor = await crearEditorDePrueba([
    {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Cita" }] }],
    },
  ]);
  let dentro = 0;
  editor.estado().doc.descendants((nodo, posicion) => {
    if (nodo.isText && nodo.text === "Cita") dentro = posicion + 2;
    return undefined;
  });

  assert.deepEqual([...blockTypesInSelection(editor.estado().doc, dentro, dentro)], ["quote"]);
});

test("con texto seleccionado salen los tipos de todos sus bloques", async () => {
  const editor = await crearEditorDePrueba([
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Uno" }] },
    { type: "paragraph", content: [{ type: "text", text: "Dos" }] },
  ]);
  // La selección **tiene que abarcar los dos bloques**: la que trae el arnés está
  // solo dentro del título, y entonces solo hay un tipo que leer, que es lo
  // correcto y no lo que este test mide.
  editor.seleccionarTodo();
  const { selection } = editor.estado();
  const tipos = blockTypesInSelection(editor.estado().doc, selection.from, selection.to);
  assert.deepEqual([...tipos].sort(), ["heading1", "paragraph"]);
});

/**
 * Los bloques de Markdown **se anidan**, y el tipo tiene que salir del contenedor.
 *
 * Un elemento de lista es un párrafo, y un párrafo de una cita es un párrafo: si
 * se mirara solo el bloque inmediato, cualquier lista o cita se leería como «Texto».
 * Estos tests lo comprueban con anidamientos reales, que es donde se rompen las
 * implementaciones que miran `parent`.
 */
const parrafo = (texto: string) => ({
  type: "paragraph",
  content: [{ type: "text", text: texto }],
});
const elemento = (texto: string, hijos: unknown[] = []) => ({
  type: "listItem",
  attrs: { label: "•", listType: "bullet", spread: false },
  content: [parrafo(texto), ...hijos],
});
const vinetas = (...contenidos: unknown[]) => ({ type: "bulletList", content: contenidos });

/** La posición dentro del texto buscando ese texto exacto. */
function dentroDe(editor: { estado(): EditorState }, texto: string): number {
  let dentro = 0;
  editor.estado().doc.descendants((nodo, posicion) => {
    if (nodo.isText && nodo.text === texto) dentro = posicion + 1;
    return undefined;
  });
  assert.ok(dentro > 0, `el texto "${texto}" no está en la nota`);
  return dentro;
}

const ANIDADOS: [string, unknown[], string, string][] = [
  ["una viñeta", [vinetas(elemento("Uno"))], "Uno", "bullet"],
  [
    "una viñeta dentro de una cita",
    [{ type: "blockquote", content: [vinetas(elemento("Uno"))] }],
    "Uno",
    "bullet",
  ],
  [
    "una cita con un párrafo",
    [{ type: "blockquote", content: [parrafo("Uno")] }],
    "Uno",
    "quote",
  ],
  [
    "una viñeta dentro de otra viñeta",
    [vinetas(elemento("Uno", [vinetas(elemento("Dos"))]))],
    "Dos",
    "bullet",
  ],
  [
    "una lista de tareas cuenta como lista",
    [
      {
        type: "taskList",
        content: [
          { type: "taskItem", attrs: { checked: false }, content: [parrafo("Uno")] },
        ],
      },
    ],
    "Uno",
    "bullet",
  ],
];

for (const [nombre, bloques, texto, esperado] of ANIDADOS) {
  test(`${nombre}: el tipo sale del contenedor, no del párrafo de dentro`, async () => {
    const editor = await crearEditorDePrueba(bloques);
    const pos = dentroDe(editor, texto);
    assert.deepEqual(
      [...blockTypesInSelection(editor.estado().doc, pos, pos)],
      [esperado],
      `${nombre}: el contenedor no se vio`,
    );
  });
}

test("un título dentro de una cita se lee como su nivel, no como texto", async () => {
  // El título manda sobre la cita: el cursor está en palabras de un título, y quien
  // escribe ve un título.
  const editor = await crearEditorDePrueba([
    { type: "blockquote", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Uno" }] }] },
  ]);
  const pos = dentroDe(editor, "Uno");
  assert.deepEqual([...blockTypesInSelection(editor.estado().doc, pos, pos)], ["heading2"]);
});