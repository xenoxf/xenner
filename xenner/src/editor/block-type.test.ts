import assert from "node:assert/strict";
import test from "node:test";

import type { EditorBlockType } from "../types/editor.ts";
import { blockTypeAt, blockTypesInSelection } from "./block-type.ts";
import type { BlockAncestor, BlockDocument, BlockPosition } from "./block-type.ts";
import { EDITOR_BLOCKS, EDITOR_BLOCK_TYPES } from "./menu-content.ts";

/**
 * Qué botón de la barra se marca de activo según lo que haya seleccionado.
 *
 * El tipo de texto tenía que poder cambiarse sobre un texto seleccionado: los
 * botones solo estaban en el dock de abajo, así que el único sitio donde se
 * podía cambiar el tipo era la línea del cursor. Estos tests vigilan la parte
 * pura de la solución —qué botón queda pulsado— y usan los nombres de nodo de
 * Tiptap, que son los que de verdad están en el esquema.
 */

interface FakeAncestor extends BlockAncestor {
  attrs: Record<string, unknown>;
}

/**
 * Una posición de ProseMirror de mentira: una lista de ancestros, de la raíz
 * hacia dentro. `depth` es el tamaño de la lista menos uno.
 */
function fakePosition(chain: { name: string; attrs?: Record<string, unknown> }[]): BlockPosition {
  const nodes: FakeAncestor[] = chain.map((node) => ({
    type: { name: node.name },
    attrs: node.attrs ?? {},
  }));
  const depth = nodes.length - 1;
  return {
    depth,
    parent: nodes[depth],
    node(at: number) {
      const found = nodes[at];
      if (!found) throw new Error(`no hay ancestro en la profundidad ${at}`);
      return found;
    },
  };
}

test("un párrafo suelto es texto", () => {
  assert.equal(blockTypeAt(fakePosition([{ name: "doc" }, { name: "paragraph" }])), "paragraph");
});

test("cada nivel de título se ensaya como su botón", () => {
  const heading = (level: number) =>
    blockTypeAt(fakePosition([{ name: "doc" }, { name: "heading", attrs: { level } }]));
  assert.equal(heading(1), "heading1");
  assert.equal(heading(2), "heading2");
  assert.equal(heading(3), "heading3");
});

test("los títulos de 4 a 6 se enseñan como el título 3 más cercano", () => {
  // El menú y la barra flotante no tienen un botón por cada nivel, y los
  // títulos de 4 a 6 se crean con el menú slash.
  for (const level of [4, 5, 6]) {
    const type = blockTypeAt(fakePosition([{ name: "doc" }, { name: "heading", attrs: { level } }]));
    assert.equal(type, "heading3", `un h${level} debería enseñarse como heading3`);
  }
});

test("un título sin nivel válido no rompe nada", () => {
  assert.equal(
    blockTypeAt(fakePosition([{ name: "doc" }, { name: "heading", attrs: {} }])),
    "heading1",
  );
});

test("la cita gana porque el párrafo de dentro también es un párrafo", () => {
  // El padre inmediato de un texto citado es un `paragraph`; si se mirara solo
  // `parent` el botón de cita nunca se marcaría.
  assert.equal(
    blockTypeAt(fakePosition([{ name: "doc" }, { name: "blockquote" }, { name: "paragraph" }])),
    "quote",
  );
});

test("las listas se reconocen por el contenedor, no por el elemento", () => {
  const inList = (name: string) =>
    blockTypeAt(fakePosition([{ name: "doc" }, { name }, { name: "listItem" }, { name: "paragraph" }]));
  assert.equal(inList("bulletList"), "bullet");
  assert.equal(inList("orderedList"), "ordered");
});

test("una tarea cuenta como lista de viñetas", () => {
  // Una tarea es un `taskItem` dentro de un `taskList`, y un `taskList` es una
  // lista de viñetas con otra forma: el botón que se marca es el de lista, no
  // hay un botón aparte para las tareas.
  assert.equal(
    blockTypeAt(
      fakePosition([
        { name: "doc" },
        { name: "taskList" },
        { name: "taskItem", attrs: { checked: false } },
        { name: "paragraph" },
      ]),
    ),
    "bullet",
  );
});

/**
 * Un documento de mentira que solo sabe contar los bloques de texto que hay en
 * un rango. Es lo único que usa `blockTypesInSelection`.
 *
 * `container` permite simular que el texto está dentro de una lista: así se
 * comprueba que un solo elemento dentro de una lista cuenta como lista y no
 * además como un texto suelto.
 */
function fakeDoc(
  blocks: { name: string; attrs?: Record<string, unknown>; container?: string }[],
): BlockDocument {
  const chainFor = (block: { name: string; attrs?: Record<string, unknown>; container?: string }) => {
    const chain: { name: string; attrs?: Record<string, unknown> }[] = [{ name: "doc" }];
    if (block.container) {
      chain.push({ name: block.container }, { name: "listItem" });
    }
    chain.push({ name: block.name, attrs: block.attrs });
    return fakePosition(chain);
  };
  return {
    resolve: (pos: number) => chainFor(blocks[pos] ?? blocks[0]),
    nodesBetween(from, to, visit) {
      for (let index = from; index < to && index < blocks.length; index += 1) {
        // Los contenedores también se visitarían, y no son texto.
        if (blocks[index].container) visit({ isTextblock: false }, index);
        visit({ isTextblock: true }, index);
      }
    },
  };
}

test("el cursor suelto marca el tipo del bloque que lo contiene", () => {
  const doc = fakeDoc([{ name: "paragraph" }, { name: "heading", attrs: { level: 2 } }]);
  // Sin selección no hay bloques que visitar: el conjunto sale del `resolve`.
  const types = blockTypesInSelection(doc, 0, 0);
  assert.equal(types.size, 1);
  assert.ok(types.has("paragraph"));
});

test("texto seleccionado devuelve los tipos de todos sus bloques", () => {
  const doc = fakeDoc([
    { name: "paragraph" },
    { name: "heading", attrs: { level: 1 } },
    { name: "paragraph" },
  ]);
  const types = blockTypesInSelection(doc, 0, 3);
  assert.deepEqual([...types].sort(), ["heading1", "paragraph"]);
});

test("una selección con un solo tipo deja un único botón marcado", () => {
  const doc = fakeDoc([
    { name: "heading", attrs: { level: 3 } },
    { name: "heading", attrs: { level: 3 } },
  ]);
  const types = blockTypesInSelection(doc, 0, 2);
  assert.equal(types.size, 1);
  assert.ok(types.has("heading3"));
});

test("un elemento dentro de una lista no cuenta también como texto suelto", () => {
  // Los contenedores que visita `nodesBetween` no son bloques de texto: si se
  // contaran, un único elemento de una lista saldría con dos tipos y ningún
  // botón marcado.
  const doc = fakeDoc([
    { name: "paragraph", container: "bulletList" },
    { name: "paragraph", container: "bulletList" },
  ]);
  const types = blockTypesInSelection(doc, 0, 2);
  assert.deepEqual([...types], ["bullet"]);
});

test("cada tipo de bloque tiene icono y nombre, y son los siete", () => {
  // El menú del `+` y la barra flotante comparten esta lista. Un botón sin
  // icono se ve como un hueco, y uno sin nombre no se puede elegir.
  const ids = EDITOR_BLOCKS.map((item) => item.id);
  assert.deepEqual(
    [...ids].sort(),
    ["bullet", "heading1", "heading2", "heading3", "ordered", "paragraph", "quote"] as EditorBlockType[],
  );
  for (const item of EDITOR_BLOCKS) {
    assert.match(item.icon, /^<svg[\s\S]*<\/svg>$/, `${item.label} se queda sin icono`);
    assert.match(item.icon, /viewBox="0 0 24 24"/, `el icono de ${item.label} no tiene viewBox`);
    assert.ok(item.label.trim().length > 0, "un bloque sin nombre no se puede elegir");
  }
  assert.deepEqual(EDITOR_BLOCK_TYPES, ids, "la lista de tipos se ha separado del catálogo");
});