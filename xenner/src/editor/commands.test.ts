import assert from "node:assert/strict";
import test from "node:test";

import type { Command } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

import type { EditorBlockType } from "../types/editor.ts";
import {
  insertAttachmentLink,
  insertImage,
  insertWhiteboard,
  leaveCaretBehind,
  setBlockType,
  setTextStyle,
} from "./commands.ts";
import type { ReportFailure } from "./commands.ts";
import { crearEditorDePrueba } from "./editor-harness.ts";
import type { TestEditor } from "./editor-harness.ts";
import { EDITOR_BLOCK_TYPES } from "./menu-content.ts";

/**
 * Cambiar el tipo de bloque no puede borrar texto. Nunca.
 *
 * Este archivo es la reacción directa al aviso de que «al pulsar el + desaparece
 * todo». Los tests que había leían el código como texto y no ejecutaban nada, así
 * que no podían ver un fallo que depende de lo que ProseMirror haga con la
 * transacción. Aquí se ejecuta de verdad: `editor-harness.ts` monta el esquema de
 * las mismas extensiones que el editor, un `EditorState` de verdad y un
 * `MarkdownManager` de verdad, sin navegador, y se comprueba el documento y el
 * Markdown que salen después de cada cambio.
 *
 * Los errores que aparecen aquí son **medidos**, no imaginados:
 *
 * - Los comandos de bloque de Milkdown **envuelven** en vez de sustituir. Con el
 *   cursor en un texto suelto, «Cita» y luego «Título 2» dejaban `> ## texto`, y
 *   no había forma de quitar el `blockquote` que se había puesto: el menú no
 *   tenía vuelta atrás.
 * - `wrapIn` **fallaba en silencio** cuando no sabía qué envolver. «Viñetas» sobre
 *   un título no hacía nada y devolvía `false`; dentro de un elemento de lista
 *   ningún tipo se aplicaba. Sin excepción, así que no había ni rastro.
 * - `tr.replaceWith(desde, hasta, ...nodos)` mete **un solo** nodo: la función
 *   solo mira el tercer argumento. Al extender los nodos con `...` se quedaba el
 *   primero y **se perdía el resto del texto del bloque**.
 */

const TIPOS = EDITOR_BLOCK_TYPES as readonly EditorBlockType[];

const parrafo = (texto: string) => ({
  type: "paragraph",
  content: [{ type: "text", text: texto }],
});

const elementoDeLista = (texto: string) => ({ type: "listItem", content: [parrafo(texto)] });

const lista = (...textos: string[]) => ({
  type: "bulletList",
  content: textos.map(elementoDeLista),
});

const titulo = (nivel: number, texto = "Uno") => ({
  type: "heading",
  attrs: { level: nivel },
  content: [{ type: "text", text: texto }],
});

const tarea = (texto: string) => ({
  type: "taskList",
  content: [{ type: "taskItem", attrs: { checked: false }, content: [parrafo(texto)] }],
});

/** Aplica un tipo y se asegura de que el documento sigue en pie. */
function aplicar(
  editor: TestEditor,
  tipo: EditorBlockType,
): { ok: boolean; fallos: string[] } {
  const fallos: string[] = [];
  const avisar: ReportFailure = (que, error) => {
    fallos.push(`${que} — ${error instanceof Error ? error.message : String(error)}`);
  };
  const ok = editor.ejecutar(setBlockType(tipo, avisar));
  editor.validar();
  return { ok, fallos };
}

/** Los nombres de los bloques de primer nivel, que es lo que se ve en el menu. */
function bloques(editor: TestEditor): string[] {
  return editor.estado().doc.content.content.map((nodo) => nodo.type.name);
}

test("ningún tipo borra texto, venga de donde venga el bloque", () => {
  // La promesa del botón: cambiar el tipo retoca el bloque, no lo vacía. Se
  // comprueba con los siete tipos del menú, cada uno desde una nota distinta,
  // porque cada forma de bloque tiene su propio camino.
  const casos: [string, unknown[], (editor: TestEditor) => void][] = [
    ["párrafo suelto", [parrafo("Hola")], (e) => e.seleccionar("Hola")],
    ["dentro de una lista", [parrafo("Antes"), lista("Uno", "Dos")], (e) => e.seleccionar("Uno")],
    [
      "dentro de una cita",
      [{ type: "blockquote", content: [parrafo("Uno"), parrafo("Dos")] }],
      (e) => e.seleccionar("Uno"),
    ],
    ["nota entera", [parrafo("Uno"), parrafo("Dos"), parrafo("Tres")], (e) => e.seleccionarTodo()],
    ["tarea", [tarea("Pendiente")], (e) => e.seleccionar("Pendiente")],
    ["dentro de una cita de una lista", [{ type: "blockquote", content: [lista("Uno")] }], (e) =>
      e.seleccionar("Uno"),
    ],
  ];

  for (const [nombre, nodos, preparar] of casos) {
    // El texto de partida, leído del documento ya construido: comparar contra el
    // mismo sitio del que se sale es lo único que de verdad importa.
    const antes = crearEditorDePrueba(nodos).texto().split(" ").sort();
    for (const tipo of TIPOS) {
      const editor = crearEditorDePrueba(nodos);
      preparar(editor);
      const { ok, fallos } = aplicar(editor, tipo);
      assert.deepEqual(fallos, [], `${nombre} + ${tipo}: ${fallos.join("; ")}`);
      assert.equal(ok, true, `${nombre} + ${tipo}: el cambio no se aplicó`);
      assert.deepEqual(
        editor.texto().split(" ").sort(),
        antes,
        `${nombre} + ${tipo}: el texto de la nota cambió (${editor.markdown()})`,
      );
      assert.match(editor.markdown(), /\S/, `${nombre} + ${tipo}: la nota quedó vacía`);
    }
  }
});

test("volver a «Texto» saca el bloque de la cita y de la lista", () => {
  // El fallo que más dolía: los comandos envolvían, así que cada elección
  // añadía una capa y ninguna la quitaba. Poner «Cita» y luego «Texto» tenía que
  // dejar un párrafo suelto, y dejaba `> texto`.
  for (const tipo of ["quote", "bullet", "ordered"] as const) {
    const editor = crearEditorDePrueba([parrafo("Linea")]);
    editor.seleccionar("Linea");
    assert.equal(aplicar(editor, tipo).ok, true);
    assert.notEqual(editor.markdown().trim(), "Linea", `${tipo} no cambió nada`);

    editor.seleccionar("Linea");
    assert.equal(aplicar(editor, "paragraph").ok, true, `${tipo} → texto no se aplicó`);
    assert.equal(editor.markdown(), "Linea", `${tipo} → texto dejó el bloque puesto`);
    assert.deepEqual(bloques(editor), ["paragraph"]);
  }
});

test("los siete tipos funcionan sobre cualquier bloque, también sobre un título", () => {
  // `wrapIn` no sabía envolver un título en una lista y devolvía `false` sin
  // lanzar nada: el botón no respondía y no había forma de enterarse.
  for (const tipo of TIPOS) {
    const editor = crearEditorDePrueba([titulo(1, "Linea")]);
    editor.seleccionar("Linea");
    const { ok, fallos } = aplicar(editor, tipo);
    assert.deepEqual(fallos, [], `${tipo} sobre un título: ${fallos.join("; ")}`);
    assert.equal(ok, true, `${tipo} sobre un título no se aplicó`);
    assert.equal(editor.texto(), "Linea", `${tipo} sobre un título cambió el texto`);
  }
});

test("los bloques que no se tocan se quedan donde estaban", () => {
  // Seleccionar el primer y el tercer párrafo de tres y poner «Viñetas» hace dos
  // listas de un elemento. Juntarlos en una sola se comería el segundo.
  const editor = crearEditorDePrueba([parrafo("Uno"), parrafo("Dos"), parrafo("Tres")]);
  editor.seleccionar("Uno");
  assert.equal(aplicar(editor, "bullet").ok, true);
  assert.match(editor.markdown(), /^Dos$/m, `el párrafo del medio desapareció: ${editor.markdown()}`);
  editor.seleccionar("Tres");
  assert.equal(aplicar(editor, "ordered").ok, true);
  assert.deepEqual(bloques(editor), ["bulletList", "paragraph", "orderedList"]);
  assert.equal(editor.markdown(), "- Uno\n\nDos\n\n1. Tres", editor.markdown());
});

test("el texto sale con sus marcas: la negrita no se pierde al cambiar de tipo", () => {
  const editor = crearEditorDePrueba([
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "Grueso" },
        { type: "text", text: " y normal" },
      ],
    },
  ]);
  editor.seleccionar("Grueso");
  assert.equal(aplicar(editor, "heading2").ok, true);
  assert.equal(editor.markdown(), "## **Grueso** y normal", editor.markdown());
});

test("pedir el tipo que ya tiene no es un fallo", () => {
  // Si no hay nada que hacer, el botón no ha fallado: la línea ya es así. Antes
  // esto se contaba como error y salía un aviso en un gesto que funcionó bien.
  const editor = crearEditorDePrueba([parrafo("Linea")]);
  editor.seleccionar("Linea");
  assert.deepEqual(aplicar(editor, "quote").fallos, []);
  editor.seleccionar("Linea");
  const repetido = aplicar(editor, "quote");
  assert.deepEqual(repetido.fallos, [], "repetir el tipo avisó de un fallo");
  assert.equal(repetido.ok, true);
  assert.equal(editor.markdown(), "> Linea", editor.markdown());
});

test("el gesto completo del menú —cambiar el tipo y soltar el cursor— no rompe nada", () => {
  // Es lo que hace el `+` al elegir una entrada: aplicar el tipo y dejar el
  // cursor detrás, para que seguir escribiendo sustituya el texto en vez de
  // borrarlo. Con las dos mitades, el documento tiene que quedar entero y con el
  // cursor en un sitio donde se pueda escribir.
  for (const tipo of TIPOS) {
    const editor = crearEditorDePrueba([parrafo("Linea"), parrafo("Otra")]);
    editor.seleccionar("Linea");
    assert.equal(aplicar(editor, tipo).ok, true, `${tipo} no se aplicó`);
    assert.equal(
      editor.ejecutar(leaveCaretBehind((que) => assert.fail(`${que}: no debería fallar`))),
      true,
      `${tipo}: el cursor no se soltó`,
    );
    editor.validar();
    assert.equal(editor.texto().split("\n").join(" ").trim(), "Linea Otra", `con ${tipo}`);
    const { selection } = editor.estado();
    assert.ok(
      selection.$from.parent.isTextblock,
      `con ${tipo}: el cursor quedó fuera del texto`,
    );
    assert.equal(selection.empty, true, `con ${tipo}: la selección sigue puesta`);
    assert.ok(selection.from >= 0 && selection.to <= editor.estado().doc.content.size);
  }
});

test("cambiar el tipo y soltar el cursor van en la MISMA transacción, y no falla", () => {
  // El fallo que nació aquí: en la app las dos mitades del gesto se ejecutan con
  // los **mismos** `props` —un solo comando, una sola transacción, un solo
  // deshacer—, así que la que suelta el cursor va después de un documento que ya
  // ha cambiado. Los tests de arriba pasaban por accidento: `editor.ejecutar`
  // abre una transacción nueva en cada llamada, y el fallo no se podía ver.
  //
  // El aviso que salía era «No se pudo aplicar el formato / el cambio se aplicó
  // pero el cursor no se quedó al final», en TODAS las opciones de bloque, con el
  // texto ya cambiado: la selección se calculaba sobre el documento anterior y
  // `tr.setSelection` la rechazaba por no apuntar al actual.
  for (const tipo of TIPOS) {
    const editor = crearEditorDePrueba([parrafo("Linea"), parrafo("Otra")]);
    editor.seleccionar("Linea");
    const fallos: string[] = [];
    const avisar: ReportFailure = (que) => fallos.push(que);
    const ok = editor.ejecutar((props) => {
      if (!setBlockType(tipo, avisar)(props)) return false;
      return leaveCaretBehind(avisar)(props);
    });
    editor.validar();
    assert.deepEqual(fallos, [], `${tipo}: avisó de un fallo con el tipo ya aplicado`);
    assert.equal(ok, true, `${tipo}: el gesto completo no se aplicó`);
    assert.equal(editor.texto(), "Linea\nOtra", `con ${tipo}: el documento se rompió`);
    const { selection } = editor.estado();
    assert.ok(selection.$from.parent.isTextblock, `con ${tipo}: el cursor quedó fuera del texto`);
    assert.equal(selection.empty, true, `con ${tipo}: la selección sigue puesta`);
    assert.ok(
      selection.from >= 0 && selection.to <= editor.estado().doc.content.size,
      `con ${tipo}: el cursor quedó fuera de la nota`,
    );
  }
});

test("un bloque con algo que no es texto no se toca, y se explica por qué", () => {
  // Rehacer el bloque entero es lo que hace que el tipo cambie de verdad, y solo
  // se puede rehacer si lo que hay dentro es texto. Un separador —o una imagen,
  // que es el mismo caso— no se puede reconstruir: el cambio se rechaza y se
  // dice por qué. Un botón que se come una imagen es peor que un botón que no
  // hace nada.
  const editor = crearEditorDePrueba([
    { type: "blockquote", content: [{ type: "horizontalRule" }, parrafo("Linea")] },
  ]);
  editor.seleccionar("Linea");
  const antes = editor.markdown();
  const { ok, fallos } = aplicar(editor, "heading2");
  assert.equal(ok, false, "no debería poder cambiar el tipo con un separador dentro");
  assert.equal(fallos.length, 1, fallos.join("; "));
  assert.match(fallos[0], /no se puede cambiar el tipo/);
  // Y el documento sigue exactamente como estaba: ni un paso a medias, que es lo
  // que dejaba el editor vacío sin poder despachar.
  editor.validar();
  assert.equal(editor.markdown(), antes);
  assert.deepEqual(bloques(editor), ["blockquote"]);
});

test("un bloque elegido con un clic no se toca, porque no tiene texto", () => {
  // Es el gesto del `+` del asa: el bloque queda **seleccionado**, no con el
  // cursor dentro. No hay texto al que aplicar un tipo, así que el comando lo
  // dice en vez de comerse el bloque.
  const editor = crearEditorDePrueba([{ type: "horizontalRule" }, parrafo("Linea")]);
  editor.despachar(editor.estado().tr.setSelection(NodeSelection.create(editor.estado().doc, 0)));
  const antes = editor.markdown();
  const { ok, fallos } = aplicar(editor, "heading2");
  assert.equal(ok, false);
  assert.equal(fallos.length, 1);
  assert.match(fallos[0], /no se puede cambiar el tipo/);
  assert.equal(editor.markdown(), antes);
  assert.deepEqual(bloques(editor), ["horizontalRule", "paragraph"]);
});

test("el cursor en el borde del documento cambia el primer bloque, no nada", () => {
  // Tras enfocar sin selección el cursor puede caer en 0..0 (padre `doc`): si el
  // plan salía vacío se devolvía éxito sin cambiar nada —el botón parecía no
  // hacer nada—. Se lleva al texto más cercano y el tipo sí cambia.
  // ProseMirror avisa por consola de esta selección, que es exactamente la que
  // no quiere nadie pero que hay que saber manejar.
  const editor = crearEditorDePrueba([parrafo("Hola")]);
  editor.despachar(
    editor.estado().tr.setSelection(TextSelection.create(editor.estado().doc, 0, 0)),
  );
  const { ok, fallos } = aplicar(editor, "heading1");
  assert.deepEqual(fallos, []);
  assert.equal(ok, true);
  assert.equal(editor.markdown(), "# Hola", editor.markdown());
});

test("adjuntar escribe un enlace con el nombre del archivo, en su propia línea", () => {
  // Con el cursor a media frase se parte el bloque: la frase queda arriba, el
  // enlace en su línea y el resto debajo. Es como se lee un adjunto en una nota.
  const editor = crearEditorDePrueba([parrafo("Frase a media frase")]);
  editor.cursorEn("media");
  const fallos: string[] = [];
  const ok = editor.ejecutar(
    insertAttachmentLink(".assets/datos.pdf", "datos.pdf", (que, error) =>
      fallos.push(`${que} — ${String(error)}`),
    ),
  );
  assert.equal(ok, true, fallos.join("; "));
  editor.validar();
  assert.deepEqual(bloques(editor), ["paragraph", "paragraph", "paragraph"]);
  assert.match(editor.markdown(), /^\[datos\.pdf\]\(\.assets\/datos\.pdf\)$/m, editor.markdown());
  // Y el texto de alrededor se conserva entero.
  assert.deepEqual(
    editor.texto().split(/\s+/).filter(Boolean).sort(),
    ["Frase", "a", "media", "datos.pdf", "frase"].sort(),
  );
  // Con el cursor detrás del enlace y con nada seleccionado: seguir escribiendo
  // no borra lo que se acaba de adjuntar.
  const { selection } = editor.estado();
  assert.equal(selection.empty, true);
  assert.equal(selection.$head.parent.textContent, "datos.pdf");
});

test("adjuntar encima de un texto seleccionado sustituye ese texto", () => {
  // Adjuntar encima de un texto seleccionado significa que ese texto era el
  // nombre del archivo.
  const editor = crearEditorDePrueba([parrafo("Informe anual")]);
  editor.seleccionar("Informe anual");
  const fallos: string[] = [];
  assert.equal(
    editor.ejecutar(
      insertAttachmentLink(".assets/informe.pdf", "informe.pdf", (que) => fallos.push(que)),
    ),
    true,
    fallos.join("; "),
  );
  editor.validar();
  assert.equal(editor.markdown(), "[informe.pdf](.assets/informe.pdf)", editor.markdown());
});

test("insertar una imagen o una pizarra deja una línea debajo", () => {
  // Sin la línea de debajo habría que tabular para seguir escribiendo, y lo que
  // se inserta es un bloque alto: el cursor se queda donde está y el bloque entra
  // después del párrafo del cursor.
  for (const caso of [
    {
      nombre: "imagen",
      nodo: /image/i,
      insertar: (avisar: ReportFailure): Command =>
        insertImage(
          { dataUrl: "data:image/png;base64,AAA", relativePath: ".assets/dibujo.png" },
          "Un pie de imagen",
          avisar,
        ),
    },
    {
      nombre: "pizarra",
      nodo: /whiteboard/i,
      insertar: (avisar: ReportFailure): Command =>
        insertWhiteboard(
          { dataUrl: "data:image/svg+xml;base64,AAA", relativePath: ".assets/pizarra.svg" },
          "dibujo-1",
          "pen",
          avisar,
        ),
    },
  ]) {
    const editor = crearEditorDePrueba([parrafo("Linea"), parrafo("Otra")]);
    editor.cursorEn("Linea");
    const fallos: string[] = [];
    const ok = editor.ejecutar(caso.insertar((que) => fallos.push(que)));
    assert.equal(ok, true, `${caso.nombre}: ${fallos.join("; ")}`);
    editor.validar();
    const nombres = bloques(editor);
    assert.deepEqual(
      [nombres[0], nombres[2], nombres[3]],
      ["paragraph", "paragraph", "paragraph"],
      `${caso.nombre}: falta la línea de debajo (${JSON.stringify(nombres)})`,
    );
    assert.match(nombres[1], caso.nodo, `${caso.nombre}: no se insertó el bloque`);
    const insertado = editor.estado().doc.content.content[1];
    assert.ok(insertado.isAtom, `${caso.nombre}: el bloque insertado debería ser un átomo`);
    assert.ok(
      String(insertado.attrs.src ?? "").startsWith("data:"),
      `${caso.nombre}: el bloque no lleva la imagen importada`,
    );
    // El texto de la nota no se toca.
    assert.deepEqual(
      editor.texto().split(/\s+/).filter(Boolean).sort(),
      ["Linea", "Otra"],
    );
  }
});

test("insertar una pizarra la deja en borrador para que abra el lienzo", () => {
  // Sin `draft` una pizarra recién creada se vería como un tablero blanco del
  // tamaño de un bloque vacío, y el lienzo no se abriría.
  const editor = crearEditorDePrueba([parrafo("Linea")]);
  editor.cursorEn("Linea");
  const fallos: string[] = [];
  assert.equal(
    editor.ejecutar(
      insertWhiteboard(
        { dataUrl: "data:image/svg+xml;base64,AAA", relativePath: ".assets/pizarra.svg" },
        "dibujo-42",
        "pen",
        (que) => fallos.push(que),
      ),
    ),
    true,
    fallos.join("; "),
  );
  editor.validar();
  const pizarra = editor.estado().doc.content.content[1];
  assert.equal(pizarra.attrs.draft, true);
  assert.equal(pizarra.attrs.drawingId, "dibujo-42");
  assert.equal(pizarra.attrs.tool, "pen");
});

test("insertar con un bloque marcado no falla: se inserta junto a él", () => {
  // Insertar desde el dock puede llegar con un bloque **seleccionado** —una
  // imagen marcada con un clic— y sin que el editor tenga el foco, porque el
  // botón está fuera del `contenteditable`. Antes de esto el bloque caía al final
  // de la nota, o no se insertaba; lo que no puede ser es comerse el bloque
  // marcado.
  const editor = crearEditorDePrueba([{ type: "horizontalRule" }, parrafo("Linea")]);
  editor.despachar(
    editor.estado().tr.setSelection(NodeSelection.create(editor.estado().doc, 1)),
  );
  const fallos: string[] = [];
  assert.equal(
    editor.ejecutar(
      insertImage(
        { dataUrl: "data:image/png;base64,AAA", relativePath: ".assets/dibujo.png" },
        undefined,
        (que) => fallos.push(que),
      ),
    ),
    true,
    fallos.join("; "),
  );
  editor.validar();
  assert.deepEqual(
    bloques(editor),
    ["horizontalRule", "paragraph", "noteImage", "paragraph"],
    JSON.stringify(bloques(editor)),
  );
});

test("el color de texto y el fondo se ponen sin pisarse", () => {
  const editor = crearEditorDePrueba([parrafo("Colorear")]);
  editor.seleccionar("Colorear");
  assert.equal(editor.ejecutar(setTextStyle("color", "#ff0000")), true);
  editor.seleccionar("Colorear");
  // El fondo se lee de lo que ya hay puesto: cambiar solo el fondo no borra el
  // color, que es lo que pasaba al aplicarlos por separado.
  assert.equal(editor.ejecutar(setTextStyle("background", "#00ff00")), true);
  editor.validar();
  const marcas = editor.estado().doc.firstChild?.firstChild?.marks ?? [];
  assert.equal(marcas.length, 1, `marcas: ${JSON.stringify(marcas.map((m) => ({ ...m.attrs })))}`);
  assert.deepEqual({ ...marcas[0].attrs }, { color: "#ff0000", background: "#00ff00" });
});

test("un color que no es hexadecimal no toca nada", () => {
  const editor = crearEditorDePrueba([parrafo("Colorear")]);
  editor.seleccionar("Colorear");
  editor.ejecutar(setTextStyle("color", "#ff0000"));
  editor.seleccionar("Colorear");
  const antes = editor.markdown();
  const marcasAntes = editor.estado().doc.firstChild?.firstChild?.marks.length ?? 0;
  for (const valor of ["rojo", "rgb(255,0,0)", "#12345", "", "var(--rojo)"]) {
    assert.equal(
      editor.ejecutar(setTextStyle("color", valor)),
      false,
      `«${valor}» no es un color y no debería aplicarse`,
    );
  }
  editor.seleccionar("Colorear");
  assert.equal(editor.markdown(), antes, "un color inválido cambió el documento");
  assert.equal(editor.estado().doc.firstChild?.firstChild?.marks.length ?? 0, marcasAntes);
});

test("sin texto seleccionado no hay nada que colorear", () => {
  // No es un fallo: no hay texto al que poner color. Con el cursor suelto el
  // comando no hace nada y no avisa de nada.
  const editor = crearEditorDePrueba([parrafo("Colorear")]);
  editor.cursorEn("Colorear");
  const fallos: string[] = [];
  assert.equal(editor.ejecutar(setTextStyle("color", "#ff0000", (que) => fallos.push(que))), false);
  assert.deepEqual(fallos, []);
  editor.validar();
  assert.equal(editor.estado().doc.firstChild?.firstChild?.marks.length ?? 0, 0);
});

test("el esquema del editor tiene lo que los comandos necesitan", () => {
  // Los comandos buscan por nombre, y un nombre que cambia deja el botón sin
  // hacer nada en vez de reventar. Si este test falla, el registro de
  // extensiones y `commands.ts` ya no hablan el mismo idioma.
  const { schema } = crearEditorDePrueba([parrafo("Linea")]);
  for (const nombre of [
    "paragraph",
    "heading",
    "blockquote",
    "bulletList",
    "orderedList",
    "listItem",
    "horizontalRule",
  ]) {
    assert.ok(schema.nodes[nombre], `el esquema no tiene el nodo ${nombre}`);
  }
  assert.ok(schema.marks.link, "el esquema no tiene la marca de enlace");
  assert.ok(schema.nodes.whiteboard, "el esquema no tiene el nodo whiteboard");
  assert.ok(schema.nodes.noteImage ?? schema.nodes.image, "el esquema no tiene nodo de imagen");
  assert.ok(
    Object.values(schema.marks).some((marca) => "color" in marca.attrs),
    "el esquema no tiene la marca de color y fondo",
  );
  assert.deepEqual(
    schema.nodes.listItem?.spec.content,
    "paragraph block*",
    "una lista con un texto suelto dentro no se valida",
  );
});