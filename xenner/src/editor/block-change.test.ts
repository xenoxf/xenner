/**
 * Cambiar el tipo de bloque no puede borrar texto. Nunca.
 *
 * Este archivo es la reacción directa al aviso de que «al pulsar el + desaparece
 * todo». Los tests que había leían el código como texto y no ejecutaban nada, así
 * que no podían ver un fallo que depende de lo que ProseMirror haga con la
 * transacción. Aquí se ejecuta de verdad: `editor-harness.ts` monta el Milkdown
 * de Milkdown —su esquema, sus comandos, su serializador— sin navegador, y se
 * comprueba el documento y el Markdown que salen después de cada cambio.
 *
 * Los errores que aparecen aquí son **medidos**, no imaginados:
 *
 * - Los comandos de Milkdown **envuelven** en vez de sustituir. Con el cursor en
 *   un texto suelto, «Cita» y luego «Título 2» dejan `> ## texto`, y no hay forma
 *   de quitar el `blockquote` que se había puesto: el menú no tenía vuelta atrás.
 * - `wrapIn` **falla en silencio** cuando no sabe qué envolver. «Viñetas» sobre un
 *   título no hacía nada y devolvía `false`; dentro de un elemento de lista
 *   ningún tipo se aplicaba. Sin excepción, así que no había ni rastro.
 * - `tr.replaceWith(desde, hasta, ...nodos)` mete **un solo** nodo: la función
 *   solo mira el tercer argumento. Al extender los nodos con `...` se quedaba el
 *   primero y **se perdía el resto del texto del bloque**.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { EDITOR_BLOCK_TYPES } from "../data/editor.ts";
import type { EditorBlockType } from "../types/editor.ts";
import { applyBlockType, leaveCaretBehind } from "./editor-commands.ts";
import { ORDEN_DEL_ESQUEMA, crearEditorDePrueba } from "./editor-harness.ts";

type Editor = Awaited<ReturnType<typeof crearEditorDePrueba>>;

/** Aplica un tipo y se asegura de que el documento sigue en pie. */
function aplicar(editor: Editor, tipo: EditorBlockType): { ok: boolean; fallos: string[] } {
  const fallos: string[] = [];
  const ok = applyBlockType(editor.ctx, tipo, (que, error) => {
    fallos.push(`${que} — ${error instanceof Error ? error.message : String(error)}`);
  });
  editor.validar();
  return { ok, fallos };
}

const parrafo = (texto: string) => ({
  type: "paragraph",
  content: [{ type: "text", text: texto }],
});

const elementoDeLista = (texto: string) => ({
  type: "list_item",
  attrs: { label: "•", listType: "bullet", spread: true },
  content: [parrafo(texto)],
});

const lista = (...textos: string[]) => ({
  type: "bullet_list",
  attrs: { spread: false },
  content: textos.map(elementoDeLista),
});

test("ningún tipo borra texto, venga de donde venga el bloque", async () => {
  // La promesa del botón: cambiar el tipo retoca el bloque, no lo vacía. Se
  // comprueba con los siete tipos del menú, cada uno desde una nota distinta,
  // porque cada forma de bloque tiene su propio camino.
  const casos: [string, unknown[], (editor: Editor) => void][] = [
    ["párrafo suelto", [parrafo("Hola")], (e) => e.seleccionar("Hola")],
    [
      "dentro de una lista",
      [parrafo("Antes"), lista("Uno", "Dos")],
      (e) => e.seleccionar("Uno"),
    ],
    [
      "dentro de una cita",
      [{ type: "blockquote", content: [parrafo("Uno"), parrafo("Dos")] }],
      (e) => e.seleccionar("Uno"),
    ],
    ["nota entera", [parrafo("Uno"), parrafo("Dos"), parrafo("Tres")], (e) => e.seleccionarTodo()],
    [
      "título",
      [{ type: "heading", attrs: { level: 1, id: "t" }, content: [{ type: "text", text: "Uno" }] }],
      (e) => e.seleccionar("Uno"),
    ],
  ];

  for (const [nombre, bloques, preparar] of casos) {
    // El texto de partida, leído del documento ya construido: comparar contra el
    // mismo sitio del que se sale es lo único que de verdad importa.
    const antes = (await crearEditorDePrueba(bloques)).texto().split(" ").sort();
    for (const tipo of EDITOR_BLOCK_TYPES) {
      const editor = await crearEditorDePrueba(bloques);
      preparar(editor);
      const { ok, fallos } = aplicar(editor, tipo as EditorBlockType);
      assert.deepEqual(fallos, [], `${nombre} + ${tipo}: ${fallos.join("; ")}`);
      assert.equal(ok, true, `${nombre} + ${tipo}: el cambio no se aplicó`);
      assert.deepEqual(
        editor.texto().split(" ").sort(),
        antes,
        `${nombre} + ${tipo}: el texto de la nota cambió`,
      );
      assert.match(editor.markdown(), /\S/, `${nombre} + ${tipo}: la nota quedó vacía`);
    }
  }
});

test("volver a «Texto» saca el bloque de la cita y de la lista", async () => {
  // El fallo que más dolía: los comandos envuelven, así que cada elección
  // añadía una capa y ninguna la quitaba. Poner «Cita» y luego «Texto» tenía que
  // dejar un párrafo suelto, y dejaba `> texto`.
  for (const tipo of ["quote", "bullet", "ordered"] as const) {
    const editor = await crearEditorDePrueba([parrafo("Linea")]);
    editor.seleccionar("Linea");
    assert.equal(aplicar(editor, tipo).ok, true);
    assert.notEqual(editor.markdown(), "Linea\n", `${tipo} no cambió nada`);

    editor.seleccionar("Linea");
    assert.equal(aplicar(editor, "paragraph").ok, true, `${tipo} → texto no se aplicó`);
    assert.equal(editor.markdown(), "Linea\n", `${tipo} → texto dejó el bloque puesto`);
  }
});

test("los siete tipos funcionan sobre cualquier bloque, también sobre un título", async () => {
  // `wrapIn` no sabe envolver un título en una lista y devolvía `false` sin
  // lanzar nada: el botón no respondía y no había forma de enterarse.
  for (const tipo of EDITOR_BLOCK_TYPES) {
    const editor = await crearEditorDePrueba([
      { type: "heading", attrs: { level: 1, id: "t" }, content: [{ type: "text", text: "Linea" }] },
    ]);
    editor.seleccionar("Linea");
    const { ok, fallos } = aplicar(editor, tipo as EditorBlockType);
    assert.deepEqual(fallos, [], `${tipo} sobre un título: ${fallos.join("; ")}`);
    assert.equal(ok, true, `${tipo} sobre un título no se aplicó`);
  }
});

test("los bloques que no se tocan se quedan donde estaban", async () => {
  // Seleccionar el primer y el tercer párrafo de tres y poner «Viñetas» hace dos
  // listas de un elemento. Juntarlos en una sola se comería el segundo.
  const editor = await crearEditorDePrueba([parrafo("Uno"), parrafo("Dos"), parrafo("Tres")]);
  editor.seleccionar("Uno");
  assert.equal(aplicar(editor, "bullet").ok, true);
  assert.match(editor.markdown(), /^Dos$/m, "el párrafo del medio desapareció");
  editor.seleccionar("Tres");
  assert.equal(aplicar(editor, "ordered").ok, true);
  assert.equal(editor.markdown(), "* Uno\n\nDos\n\n1. Tres\n");
});

test("el texto sale con sus marcas: la negrita no se pierde al cambiar de tipo", async () => {
  const editor = await crearEditorDePrueba([
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "strong" }], text: "Grueso" },
        { type: "text", text: " y normal" },
      ],
    },
  ]);
  editor.seleccionar("Grueso");
  assert.equal(aplicar(editor, "heading2").ok, true);
  assert.equal(editor.markdown(), "## **Grueso** y normal\n");
});

test("pedir el tipo que ya tiene no es un fallo", async () => {
  // Si no hay nada que hacer, el botón no ha fallado: la línea ya es así. Antes
  // esto se contaba como error y salía un aviso en un gesto que funcionó bien.
  const editor = await crearEditorDePrueba([parrafo("Linea")]);
  editor.seleccionar("Linea");
  const { ok, fallos } = aplicar(editor, "quote");
  assert.deepEqual(fallos, []);
  editor.seleccionar("Linea");
  const repetido = aplicar(editor, "quote");
  assert.deepEqual(repetido.fallos, [], "repetir el tipo avisó de un fallo");
  assert.equal(repetido.ok, true);
  assert.equal(editor.markdown(), "> Linea\n");
});

test("el gesto completo del menú —cambiar el tipo y soltar el cursor— no rompe nada", async () => {
  // Es lo que hace el `+` al elegir una entrada: aplicar el tipo y dejar el
  // cursor detrás, para que seguir escribiendo sustituya el texto en vez de
  // borrarlo. Con las dos mitades, el documento tiene que quedar entero y con el
  // cursor en un sitio donde se pueda escribir.
  for (const tipo of EDITOR_BLOCK_TYPES) {
    const editor = await crearEditorDePrueba([parrafo("Linea"), parrafo("Otra")]);
    editor.seleccionar("Linea");
    assert.equal(aplicar(editor, tipo as EditorBlockType).ok, true, `${tipo} no se aplicó`);
    leaveCaretBehind(editor.view, (que, error) => {
      throw new Error(`${que}: ${String(error)}`);
    });
    editor.validar();
    assert.equal(editor.texto().split("\n").join(" ").trim(), "Linea Otra", `con ${tipo}`);
    const { selection } = editor.estado();
    assert.ok(selection.from >= 0 && selection.to <= editor.estado().doc.content.size);
  }
});

test("un bloque que no es texto no se toca, y se explica por qué", async () => {
  // Rehacer el bloque entero es lo que hace que el tipo cambie de verdad, y solo
  // se puede rehacer si lo que hay dentro es texto. Un separador —o una imagen,
  // que es el mismo caso— no se puede reconstruir: el cambio se rechaza y se
  // dice por qué. Un botón que se come una imagen es peor que un botón que no
  // hace nada.
  const editor = await crearEditorDePrueba([
    { type: "blockquote", content: [{ type: "hr" }, parrafo("Linea")] },
  ]);
  editor.seleccionar("Linea");
  const { ok, fallos } = aplicar(editor, "heading2");
  assert.equal(ok, false, "no debería poder cambiar el tipo con un separador dentro");
  assert.equal(fallos.length, 1);
  assert.match(fallos[0], /no se puede cambiar el tipo/);
  // Y el documento sigue exactamente como estaba.
  editor.validar();
  assert.match(editor.markdown(), /Linea/);
});
test("la lista de esquemas de Milkdown está completa", async () => {
  // El arnés construye el esquema registrando los plugins del preset, en orden.
  // Si Milkdown añade un nodo y aquí no está, el esquema se monta a medias y los
  // fallos que salen son de otra cosa. Esta lista es de `preset-commonmark/src/
  // composed/schema.ts`; `headingIdGenerator` no se exporta, y por eso el puente
  // del arnés le da un valor por defecto.
  const schemas = Object.keys(await import("@milkdown/kit/preset/commonmark")).filter((nombre) =>
    /Schema$/.test(nombre),
  );
  const faltan = schemas.filter((nombre) => !ORDEN_DEL_ESQUEMA.includes(nombre));
  assert.deepEqual(faltan, [], `el arnés no registra: ${faltan.join(", ")}`);

  // Y el esquema que sale tiene lo que un editor de texto necesita para funcionar.
  const editor = await crearEditorDePrueba([parrafo("Linea")]);
  editor.validar();
  assert.equal(editor.markdown(), "Linea\n");
});
