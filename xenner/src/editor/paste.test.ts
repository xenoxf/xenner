import assert from "node:assert/strict";
import test from "node:test";

import { getExtensionField } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { MarkdownManager } from "@tiptap/markdown";
import { Slice } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import { crearEditorDePrueba } from "./editor-harness.ts";
import type { TestEditor } from "./editor-harness.ts";
import { createNoteMarkdownManager } from "./markdown/manager.ts";
import {
  PasteNote,
  contenidoMarkdown,
  esMarkdown,
  limpiarHtmlDeOficina,
  pegarMarkdown,
  propsDePegado,
} from "./paste.ts";

/**
 * Pegar es un cambio de documento, así que se mide.
 *
 * Los `props` del pegado se construyen con `propsDePegado` —la misma función que
 * usa la extensión— y se les da una vista de mentira con lo único que miran: el
 * estado y el despachador. Así se prueba de verdad la decisión («esto es Markdown»
 * o «esto no») y la transacción que sale, sin montar un navegador.
 *
 * El HTML de los procesador de textos es el que sale de copiar y pegar de verdad:
 * `<o:p>`, atributos `mso-`, `<span>` de relleno y `<b>` que cierran antes de tiempo.
 * Si al limpiarlo se pierde una palabra, la prueba lo dice.
 */

const manager: MarkdownManager = createNoteMarkdownManager();

const parrafo = (texto: string) => ({ type: "paragraph", content: [{ type: "text", text: texto }] });

/** El portapapeles de un pegado, con lo que traiga en cada formato. */
function portapapeles(texto: string, html = ""): ClipboardEvent {
  return {
    clipboardData: {
      getData: (tipo: string) => (tipo === "text/plain" ? texto : html),
    },
  } as unknown as ClipboardEvent;
}

/**
 * La vista que el pegado necesita: el estado y el despachador, que en el arnés son
 * los mismos que usa cualquier otro test. No hay nada más que mirar, y no se
 * inventa nada más.
 */
function vistaDe(editor: TestEditor): EditorView {
  return {
    state: editor.estado(),
    dispatch: (tr: Transaction) => editor.despachar(tr),
  } as unknown as EditorView;
}

/** Pega en el editor y devuelve si el pegado se ha ocupado de la tecla. */
function pegar(
  editor: TestEditor,
  texto: string,
  html = "",
  sinGestor = false,
): boolean {
  const props = propsDePegado({ gestor: () => (sinGestor ? null : manager) });
  return props.handlePaste?.(vistaDe(editor), portapapeles(texto, html), Slice.empty) === true;
}

/** El texto que se ve en un HTML: sin etiquetas y sin espacios de relleno. */
function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// El criterio: cuándo es Markdown
// ---------------------------------------------------------------------------

test("un marcador de bloque al principio de una línea es Markdown", () => {
  const siEsMarkdown = [
    "# Título",
    "## Título\n\nTexto",
    "- Viñeta",
    "* Viñeta",
    "Texto normal\n\n1. Numerada",
    "> Cita",
    "```js\nconst a = 1\n```",
    "| Columna | Otra |\n| --- | --- |",
    "Antes\n\n---\n\nDespués",
  ];
  for (const texto of siEsMarkdown) {
    assert.equal(esMarkdown(texto), true, `«${texto}» sí es Markdown`);
  }
});

test("un texto normal no es Markdown, por muy símbolos que tenga", () => {
  const noEsMarkdown = [
    "",
    "Hola",
    "Hola *mundo*, así se escribe esto",
    "Se bought 5.000 euros", // el punto de millar no es una lista
    "El plano es a > b en tamaño",
    "2+2=4 y 3*3=9",
  ];
  for (const texto of noEsMarkdown) {
    assert.equal(esMarkdown(texto), false, `«${texto}» no es Markdown`);
  }
});

// ---------------------------------------------------------------------------
// El pegado de Markdown
// ---------------------------------------------------------------------------

test("el Markdown pegado entra como bloques y el texto no cambia", () => {
  const editor = crearEditorDePrueba([parrafo("Antes")]);
  editor.cursorEn("Antes");

  assert.equal(pegar(editor, "# Título\n\n- uno\n- dos\n\n1. tres"), true);
  editor.validar();
  assert.equal(editor.markdown(), "# Título\n\n- uno\n- dos\n\n1. tres\n\nAntes");
});

test("el pegado es una sola transacción, para que Mod-z lo deshaga entero", () => {
  const editor = crearEditorDePrueba([parrafo("Antes")]);
  editor.cursorEn("Antes");
  let despachadas = 0;
  const props = propsDePegado({ gestor: () => manager });
  const vista = {
    state: editor.estado(),
    dispatch: (tr: Transaction) => {
      despachadas += 1;
      editor.despachar(tr);
    },
  } as unknown as EditorView;

  props.handlePaste?.(vista, portapapeles("# Título\n\n- uno"), Slice.empty);
  // A medio pegar, `Mod-z` dejaría media nota y un bloque partido.
  assert.equal(despachadas, 1);
});

test("el cursor queda al final de lo pegado, con nada seleccionado", () => {
  const editor = crearEditorDePrueba([parrafo("Antes")]);
  editor.cursorEn("Antes");
  assert.equal(pegar(editor, "# Título\n\n- uno\n- dos"), true);

  const seleccion = editor.estado().selection;
  assert.equal(seleccion.empty, true, "lo pegado se queda seleccionado y se borraría al escribir");
  assert.equal(seleccion.$from.parent.textContent, "dos", "el cursor no está al final de lo pegado");

  // Y sigue escribiendo donde toca: si el cursor estuviera mal, la «X» entraría en
  // otro sitio y el Markdown saldría distinto.
  editor.despachar(editor.estado().tr.insertText("X"));
  assert.match(editor.markdown(), /- dosX/);
});

test("pegar en medio de una frase parte el bloque, como en Docs", () => {
  const editor = crearEditorDePrueba([parrafo("Hola mundo")]);
  editor.cursorEn("mundo");

  assert.equal(pegar(editor, "## En medio"), true);
  editor.validar();
  assert.equal(editor.markdown(), "Hola \n\n## En medio\n\nmundo");
});

test("pegar sustituye lo que estaba seleccionado", () => {
  const editor = crearEditorDePrueba([parrafo("Hola mundo")]);
  editor.seleccionar("Hola");

  assert.equal(pegar(editor, "> Cita"), true);
  editor.validar();
  assert.equal(editor.markdown(), "> Cita\n\n mundo");
});

test("un texto que no es Markdown se deja pegar como estaba", () => {
  const editor = crearEditorDePrueba([parrafo("Antes")]);
  editor.cursorEn("Antes");

  // Devolver `false` es lo que hace que ProseMirror pegue su texto plano: aquí no se
  // toca nada y el asterisco sigue siendo un asterisco.
  assert.equal(pegar(editor, "Hola *mundo*"), false);
  assert.equal(editor.markdown(), "Antes");
});

test("con HTML que ya trae bloques manda el HTML, no el Markdown adivinado", () => {
  const editor = crearEditorDePrueba([parrafo("Antes")]);
  editor.cursorEn("Antes");

  // Una tabla de Word llega mejor como tabla que como texto con barras.
  assert.equal(pegar(editor, "| a | b |", "<table><tr><td>a</td></tr></table>"), false);
  assert.equal(editor.markdown(), "Antes");
});

test("sin gestor de Markdown se deja el pegado a ProseMirror", () => {
  const editor = crearEditorDePrueba([parrafo("Antes")]);
  editor.cursorEn("Antes");

  // Sin el gestor no se puede convertir, y el pegado por defecto sí: se le deja.
  assert.equal(pegar(editor, "# Título", "", true), false);
  assert.equal(editor.markdown(), "Antes");
});

test("el conversor devuelve el documento y con null si no hay nada", () => {
  const documento = contenidoMarkdown(manager, "# Título");
  assert.equal(documento?.type, "doc");
  assert.equal(documento?.content?.[0]?.type, "heading");
  assert.equal(contenidoMarkdown(manager, "   "), null);
});

test("el pegado no se come el teclado si el Markdown no se puede convertir", () => {
  const editor = crearEditorDePrueba([parrafo("Antes")]);
  editor.cursorEn("Antes");

  // Un gestor que falla no puede dejar la nota a medias: se avisa y se devuelve
  // `false`, que es como se dice «esto no lo he hecho yo».
  const props = propsDePegado({
    gestor: () => ({ parse: () => { throw new Error("no se puede"); } }) as unknown as MarkdownManager,
  });
  const vista = {
    state: editor.estado(),
    dispatch: (tr: Transaction) => editor.despachar(tr),
  } as unknown as EditorView;

  assert.equal(props.handlePaste?.(vista, portapapeles("# Título"), Slice.empty), false);
  assert.equal(editor.markdown(), "Antes");
});

// ---------------------------------------------------------------------------
// El HTML de Word, LibreOffice y Google Docs
// ---------------------------------------------------------------------------

/** El HTML que sale de copiar dos párrafos de Word de verdad. */
const HTML_DE_WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><style><!-- p.MsoNormal {margin:0cm; font-size:11.0pt;} --></style>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Normal</w:View></w:WordDocument></xml><![endif]--></head>
<body lang=ES>
<p class="MsoNormal" style="mso-bidi-font-weight:normal"><span style="mso-spacerun:yes">&nbsp;&nbsp;</span><b><i>Negrita cursiva</b></i><i> y cursiva</i><o:p></o:p></p>
<p class="MsoNormal"><o:p>&nbsp;</o:p></p>
<p class="MsoNormal"><span class="MsoNormal"><font color="#FF0000" size="3">Rojo</font></span><o:p></o:p></p>
<p class="MsoNormal">Un <span style="mso-spacerun:yes">   </span>hueco<o:p></o:p></p>
</body></html>`;

test("el HTML de Word llega limpio y sin perder ni una palabra", () => {
  const limpio = limpiarHtmlDeOficina(HTML_DE_WORD);

  // Ni una marca de Office: ni el namespace, ni los `mso-*`, ni las clases `Mso*`,
  // ni los estilos del programa. Todo eso no se ve pero se guarda en la nota.
  assert.doesNotMatch(limpio, /mso-/i, "quedan atributos `mso-*`");
  assert.doesNotMatch(limpio, /class="Mso/i, "quedan clases de Word");
  assert.doesNotMatch(limpio, /<\/?[ow]:/i, "quedan etiquetas del namespace de Office");
  assert.doesNotMatch(limpio, /xmlns/i, "quedan declaraciones de namespace");
  assert.doesNotMatch(limpio, /<style/i, "quedan los estilos de Word");
  assert.doesNotMatch(limpio, /<!--/, "quedan comentarios de Word");
  // Los huecos de relleno no son texto: `&nbsp;` y los espacios de `mso-spacerun`
  // se cuelan en la nota como espacios raros.
  assert.doesNotMatch(limpio, /&nbsp;|spacerun/i, "queda relleno de Word");

  // Y lo que alguien escribió sigue ahí, todo.
  assert.equal(
    textoDe(limpio),
    "Negrita cursiva y cursiva Rojo Un hueco",
    "al limpiar el HTML se ha perdido o añadido texto",
  );
});

test("las marcas mal anidadas de Word se desenredan sin perder texto", () => {
  // `<b>negrita <i>cursiva</b></i>` es lo que produce Word sin parar. Mal anidado
  // el HTML se ve mal y las marcas no se pueden editar bien.
  const limpio = limpiarHtmlDeOficina(
    `<p class="MsoNormal"><b>Negrita <i>cursiva</b></i><o:p></o:p></p><p class="MsoNormal"><b><b>doble</b></b><o:p></o:p></p>`,
  );
  assert.equal(limpio, "<p><b>Negrita <i>cursiva</i></b></p><p><b>doble</b></p>");
});

test("el color de verdad se conserva y el que no se, no", () => {
  // El editor solo lee el color de un `span` con estilo, así que un `<font color>`
  // se traduce; y el relleno de Word se quita aunque lleve estilo.
  const limpio = limpiarHtmlDeOficina(
    `<p class="MsoNormal"><font color="#FF0000">Rojo</font><span style="font-family:Calibri"> normal</span><span style="mso-spacerun:yes">&nbsp;</span></p>`,
  );
  assert.match(limpio, /<span style="color:#FF0000">Rojo<\/span>/, "el color de Word se ha perdido");
  assert.doesNotMatch(limpio, /Calibri/, "la fuente de Word se cuela en la nota");
  assert.equal(textoDe(limpio), "Rojo normal");
});

test("el HTML que no es de un procesador de textos no se toca", () => {
  // El pegado de una web, de un correo o del propio editor es sagrado: quitarle
  // los `<span>` sería quitarle el color a quien pegó.
  const html = '<p>Hola <b>mundo</b> con <span style="color:#ff0000">color</span></p>';
  assert.equal(limpiarHtmlDeOficina(html), html);
});

test("el mismo HTML se puede limpiar dos veces seguidas", () => {
  // Una expresión global con estado (`lastIndex`) limpia el primer pegado y se
  // olvida en el segundo. Es el fallo silencioso más caro que puede tener este
  // archivo: el mismo texto entra limpio una vez y sucio la siguiente.
  const primera = limpiarHtmlDeOficina(HTML_DE_WORD);
  const segunda = limpiarHtmlDeOficina(HTML_DE_WORD);
  assert.equal(primera, segunda);
});

test("transformPastedHTML deja el HTML de otros programas como estaba", () => {
  const props = propsDePegado({ gestor: () => manager });
  assert.equal(props.transformPastedHTML?.("<p>Hola</p>", {}), "<p>Hola</p>");
  assert.equal(
    props.transformPastedHTML?.('<p class="MsoNormal">Hola<o:p></o:p></p>', {}),
    "<p>Hola</p>",
  );
});

test("el pegado es un comando: con el cursor en medio, parte el bloque", () => {
  const editor = crearEditorDePrueba([parrafo("Hola mundo")]);
  editor.cursorEn("mundo");
  let despachadas = 0;

  const ok = pegarMarkdown(manager, "## En medio")(
    editor.estado(),
    (tr) => {
      despachadas += 1;
      editor.despachar(tr);
    },
  );
  editor.validar();
  assert.equal(ok, true);
  assert.equal(despachadas, 1);
  assert.equal(editor.markdown(), "Hola \n\n## En medio\n\nmundo");
});

test("un texto que no es Markdown devuelve false antes de tocar nada", () => {
  const editor = crearEditorDePrueba([parrafo("Antes")]);
  editor.cursorEn("Antes");
  let despachadas = 0;

  const ok = pegarMarkdown(manager, "Hola *mundo*")(editor.estado(), () => {
    despachadas += 1;
  });
  assert.equal(ok, false);
  assert.equal(despachadas, 0);
});

test("la extensión instala el plugin con el gestor de su propio editor", () => {
  // El cableado de `PasteNote`: usa el `MarkdownManager` de **esta** instancia y no
  // uno de mentira, que es lo que garantiza que el Markdown pegado traiga nodos que
  // el esquema del editor conoce. Con otro, el pegado reventaría al aplicarse.
  const editor = crearEditorDePrueba([parrafo("Antes")]);
  editor.cursorEn("Antes");
  const plugins = getExtensionField(PasteNote, "addProseMirrorPlugins", {
    name: "notePaste",
    options: {},
    // Del editor solo se usa su gestor de Markdown, y aquí se le da el mismo que
    // usan los tests: es el `MarkdownManager` de las extensiones del registro.
    editor: { markdown: manager } as unknown as Editor,
  })?.();
  const props = plugins?.[0].props;
  assert.ok(props?.handlePaste, "el plugin tiene que mirar el pegado");
  assert.ok(props?.transformPastedHTML, "el plugin tiene que limpiar el HTML");

  assert.equal(
    props.handlePaste?.(vistaDe(editor), portapapeles("# Título"), Slice.empty),
    true,
  );
  editor.validar();
  assert.equal(editor.markdown(), "# Título\n\nAntes");
  assert.equal(
    props.transformPastedHTML?.('<p class="MsoNormal">Hola<o:p></o:p></p>', {}),
    "<p>Hola</p>",
  );
});