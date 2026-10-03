import { Extension } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { MarkdownManager } from "@tiptap/markdown";
import { Slice } from "@tiptap/pm/model";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Selection, Transaction } from "@tiptap/pm/state";
import type { EditorProps, EditorView } from "@tiptap/pm/view";

import type { ReportFailure } from "./commands.ts";

/**
 * Lo que pasa cuando alguien pega algo de fuera.
 *
 * Dos cosas, y las dos se notan mucho más de lo que se ven:
 *
 * - **Markdown pegado.** Copiar el texto de un archivo `.md`, de un visor de
 *   Markdown o de una terminal y pegarlo aquí no puede dejar la nota llena de
 *   almohadillas. Si el texto es claramente Markdown se convierte a bloques de
 *   verdad; si no lo es —una frase con un asterisco suelto, un párrafo de un
 *   correo— se pega tal cual, que es lo que espera quien copia una frase.
 * - **HTML de Word, LibreOffice o Google Docs.** Su portapapeles viene con
 *   `<o:p>`, atributos `mso-*`, `<span>` vacíos y `<b>`/`<i>` mal anidados, y
 *   todo eso se cuela en la nota como basura que ni se ve en el Markdown.
 *
 * Las dos son **interceptores**, no manejadores: cuando no hay nada que aportar
 * se devuelve `false` —o se devuelve el HTML tal cual— y sigue el
 * comportamiento de ProseMirror, que es el que sabe pegar tablas, imágenes y
 * enlaces. Reescribir el pegado entero sería una forma tranquila de romper algo
 * que ya funciona.
 */

// ---------------------------------------------------------------------------
// Markdown pegado
// ---------------------------------------------------------------------------

/**
 * Los marcadores de bloque que delatan un texto de Markdown.
 *
 * Solo se mira el **comienzo de alguna línea**: `# `, `> `, un cercado de código
 * o una tabla empiezan de una forma que en un texto normal no aparece, mientras
 * que un `*` suelto en medio de una frase es cosa de todos los días. Ese es el
 * criterio: una nota con un asterisco pegado tiene que salir con el asterisco.
 */
const MARCADORES_DE_BLOQUE: readonly RegExp[] = [
  /^#{1,6}\s/, // # Título
  /^[-*+]\s/, // - Viñeta
  /^\d+[.)]\s/, // 1. Numerada
  /^>\s?/, // > Cita
  /^```/, // ```Bloque de código
  /^\|/, // | Tabla
  /^(?:-{3,}|\*{3,}|_{3,})\s*$/, // --- Separador
];

/**
 * Si el texto pegado es Markdown y por tanto hay que convertirlo.
 *
 * No se intenta adivinar: o hay un marcador de bloque al principio de alguna
 * línea, o el texto se pega como texto.
 */
export function esMarkdown(texto: string): boolean {
  return texto
    .split(/\r?\n/)
    .some((linea) => MARCADORES_DE_BLOQUE.some((marcador) => marcador.test(linea)));
}

/**
 * El Markdown convertido a documento del editor, o `null` si no se puede.
 *
 * El gestor es el de la misma instancia del editor (`editor.markdown`), que es
 * el único que conoce las extensiones que el editor tiene puestas: con otro, el
 * Markdown entraría con nodos que el esquema no tiene y el pegado reventaría
 * justo al aplicarse.
 */
export function contenidoMarkdown(
  manager: MarkdownManager,
  texto: string,
  report?: ReportFailure,
): JSONContent | null {
  try {
    const documento = manager.parse(texto);
    if (documento.type !== "doc" || !documento.content?.length) return null;
    return documento;
  } catch (error) {
    report?.("el Markdown pegado no se pudo convertir", error);
    return null;
  }
}

/**
 * El último sitio donde se puede escribir antes de `pos`.
 *
 * Existe porque `TextSelection.near` no sirve para esto: si la posición cae dentro
 * de un bloque de texto —que es justo lo que pasa, porque el punto donde termina
 * lo pegado es el principio del texto que quedaba detrás— `near` devuelve esa
 * misma posición, y el cursor se quedaría al principio de la frase partida. Lo que
 * se busca es el final de lo pegado, que está un poco más atrás.
 *
 * Con `bias` negativo `near` baja al último texto del bloque anterior, saltando lo
 * que no sea de texto: si lo último pegado era un separador o una imagen, no hay
 * texto donde acabar y el cursor cae en el último que sí lo hay, que es lo único
 * donde se puede seguir escribiendo.
 */
function finalAntesDe(doc: Node, pos: number): Selection {
  const $pos = doc.resolve(pos);
  // Con texto dentro del mismo bloque por delante, el final está justo aquí.
  if ($pos.parent.inlineContent && $pos.parentOffset > 0) return TextSelection.create(doc, pos);
  // Si no, hay que salirse del bloque: `before` da la posición justo anterior al
  // nodo en el que estamos, que es donde termina el contenido anterior.
  const nivel = $pos.parent.inlineContent ? $pos.depth : $pos.depth + 1;
  return TextSelection.near(doc.resolve($pos.before(nivel)), -1);
}

/**
 * Mete el Markdown pegado como bloques y deja el cursor detrás.
 *
 * Tres cosas que no son negociables, y por eso están escritas aquí en vez de
 * delegadas:
 *
 * - **Una sola transacción.** El pegado entero es un paso del historial; a medio
 *   pegar, `Mod-z` deja media nota y un bloque partido.
 * - **El cursor al final de lo pegado y con nada seleccionado.** Si la selección
 *   se queda puesta, el primer carácter que se escriba sustituye lo que se acaba
 *   de pegar. Es el fallo más caro de un pegado porque no se ve: la nota se
 *   queda vacía y parece que el editor se ha comido el texto.
 * - **`replaceSelection` y no `insert`**: parte el bloque donde esté el cursor
 *   para que lo pegado caiga en bloques enteros, que es lo que hace Docs.
 */
export function pegarMarkdown(
  manager: MarkdownManager,
  texto: string,
  report?: ReportFailure,
): (estado: EditorState, despachar: (tr: Transaction) => void) => boolean {
  return (estado, despachar) => {
    // Sin marcador de bloque no hay nada que decidir: se pega como texto, que es
    // lo que quiere quien copia una frase con un asterisco suelto.
    if (!esMarkdown(texto)) return false;
    const documento = contenidoMarkdown(manager, texto, report);
    if (!documento) return false;
    try {
      const { schema } = estado;
      const doc = schema.nodeFromJSON(documento);
      if (doc.type !== schema.topNodeType) {
        throw new Error(`el Markdown pegado no es un documento sino un ${doc.type.name}`);
      }
      const { tr } = estado;
      tr.replaceSelection(new Slice(doc.content, 0, 0));
      // Lo que se inserta termina justo donde `replaceSelection` ha dejado la
      // selección, así que el cursor se pone al final de eso y no donde estaba.
      tr.setSelection(finalAntesDe(tr.doc, tr.selection.$to.pos));
      // Lo que sale de aquí acaba en el Markdown que se guarda: si el documento
      // ya no fuera legal, mejor el texto plano que una nota rota.
      tr.doc.check();
      despachar(tr.scrollIntoView());
      return true;
    } catch (error) {
      report?.("el Markdown pegado no se pudo insertar", error);
      return false;
    }
  };
}

/**
 * Si el HTML del portapapeles ya trae estructura de bloques.
 *
 * Cuando lo trae, manda el HTML: una tabla de Word o una lista con sus niveles
 * llegan mejor como estructura que adivinada desde el texto. Y cuando no lo trae
 * —un `.md` abierto en un visor, un archivo de texto, la terminal, el portapapeles
 * de un editor que solo pone `<div>` y `<span>`— el texto es lo único que hay.
 */
const HTML_CON_BLOQUES =
  /<(h[1-6]|ul|ol|li|blockquote|pre|table|td|th|tr|hr|img|figure|dl|dt|dd)\b/i;

/** Los dos `props` de ProseMirror que intervienen en un pegado. */
type PegadaDelEditor = Pick<EditorProps, "handlePaste" | "transformPastedHTML">;

/** Lo que el pegado necesita del editor, y se le pide solo cuando hace falta. */
export interface PegadoDelEditor {
  /** El gestor de Markdown de esta instancia, o `null` si no lo hay. */
  gestor(): MarkdownManager | null;
  /** Quién se entera si el pegado no se pudo convertir. */
  report?: ReportFailure;
}

/**
 * Los `props` del plugin de pegado.
 *
 * Se construyen aparte de la extensión para que se puedan probar: lo que hay que
 * comprobar es qué se inserta y cuándo se devuelve `false`, y eso se mide con un
 * estado y un `dispatch`, sin navegador. Es el mismo motivo por el que los
 * atajos son comandos de ProseMirror y no de Tiptap.
 */
export function propsDePegado(editor: PegadoDelEditor): PegadaDelEditor {
  return {
    handlePaste: (view, event) => pegarDesdePortapapeles(view, event, editor),
    transformPastedHTML: (html) => limpiarHtmlDeOficina(html),
  };
}

/**
 * El pegado de texto Markdown.
 *
 * Devuelve `true` solo cuando se ha ocupado del pegado. Con `false`, y sin
 * haber tocado nada, sigue lo que haga ProseMirror con el HTML: el
 * comportamiento de siempre para todo lo que aquí no hay nada que aportar.
 */
function pegarDesdePortapapeles(
  view: EditorView,
  event: ClipboardEvent,
  editor: PegadoDelEditor,
): boolean {
  const datos = event.clipboardData;
  if (!datos) return false;
  const texto = datos.getData("text/plain") ?? "";
  if (!esMarkdown(texto)) return false;
  // El HTML manda cuando trae bloques de verdad: se pegaría mejor, y rehacerlo
  // desde el texto sería tirar esa información.
  if (HTML_CON_BLOQUES.test(datos.getData("text/html") ?? "")) return false;
  const manager = editor.gestor();
  // Sin gestor no se puede convertir, y el pegado por defecto sí: se le deja.
  if (!manager) return false;
  return pegarMarkdown(manager, texto, editor.report)(view.state, view.dispatch);
}

// ---------------------------------------------------------------------------
// HTML de Word, LibreOffice y Google Docs
// ---------------------------------------------------------------------------

/**
 * Lo que delata un HTML que viene de un procesador de textos.
 *
 * Sin esto la limpieza se aplicaría a cualquier HTML pegado, y quitarle el
 * `<span>` a una página web es quitarle el color de la letra a la página de
 * otro. Se busca lo que solo pone Office: los `mso-*`, las clases `Mso*`, los
 * prefijos `o:`/`w:`, los `urn:schemas-microsoft-com` y la firma de Google Docs.
 * De LibreOffice, el `generator` de su `<meta>`.
 */
const ES_HTML_DE_UN_PROCESADOR_DE_TEXTOS =
  /mso-[\w-]+|class="Mso|<\/?[owvm]:[\w-]+|urn:schemas-microsoft-com|xmlns:[\w-]+=|LibreOffice|OpenOffice|docs-internal-guid/i;

/**
 * Limpia el HTML de un procesador de textos.
 *
 * Lo que se quita, y por qué:
 *
 * 1. **Basura que nunca se ve.** Los comentarios, el `<style>` con los estilos
 *    de Word, el `<xml>`, los `<meta>`: ni se ven ni se pueden editar, pero ahí
 *    están cuando ProseMirror va a leer el HTML.
 * 2. **Etiquetas de Office.** `<o:p>&nbsp;</o:p>` es el párrafo vacío de Word —su
 *    contenido es un espacio que no es texto— y los `<w:*>` son la maquetación de
 *    Word, no contenido. Se quitan **sin perder el texto que hay dentro**, que es
 *    donde está lo que alguien escribió.
 * 3. **Atributos de Office**: `mso-*`, `class="MsoNormal"`, `o:spid`, `xmlns:w`.
 *    De los `style` solo se va lo que es de Word (`mso-bidi-…`); el color de
 *    verdad se queda, que es de las pocas cosas de un `style` de Office que el
 *    editor sabe leer.
 * 4. **`<span>` y `<font>` que no aportan nada.** Un `<span
 *    style="mso-spacerun:yes">` entre dos párrafos es un hueco, no texto.
 * 5. **Negritas y cursivas mal anidadas.** Word produce `<b>negrita <i>cursiva</b></i>`
 *    constantemente, y mal anidado el HTML se ve mal y las marcas no se pueden
 *    editar bien. Se desenreda con una pila: en la pila solo hay marcas de
 *    formato, así que cerrar de más no se lleva por delante ni una letra.
 *
 * Si el HTML no viene de un procesador de textos se devuelve **tal cual**, para
 * que el pegado normal siga siendo el de siempre.
 */
export function limpiarHtmlDeOficina(html: string): string {
  if (!ES_HTML_DE_UN_PROCESADOR_DE_TEXTOS.test(html)) return html;
  return desenredar(sinBasuraDeOficina(html));
}

/** Un comentario de Word, que a veces trae un `<xml>` dentro. */
const COMENTARIOS = /<!--[\s\S]*?-->/g;

/** Contenedores cuyo contenido es del programa, nunca de la nota. */
const BLOQUES_DEL_PROGRAMA = [
  /<(style|script|xml|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
  /<(meta|link|base)\b[^>]*\/?>/gi,
];

/**
 * Etiquetas que solo son relleno del programa.
 *
 * `<o:p>&nbsp;</o:p>` es el párrafo vacío de Word, y un
 * `<span style="mso-spacerun:yes">&nbsp;&nbsp;</span>` es el espacio que pone
 * entre párrafos. Los dos tienen el mismo problema: no son texto, son huecos, y
 * al pegarlos salen como espacios raros dentro de la nota.
 */
const ETIQUETAS_DE_RELLENO = [
  /<(?:o:p|w:p)\b[^>]*>(?:&nbsp;|&#160;|&#xa0;|\s)*<\/(?:o:p|w:p)\s*>/gi,
  /<(?:span|font)\b[^>]*>(?:&nbsp;|&#160;|&#xa0;|\s)*<\/(?:span|font)\s*>/gi,
];

/** El HTML sin comentarios, sin estilos del programa y sin etiquetas de relleno. */
function sinBasuraDeOficina(html: string): string {
  let limpio = html;
  for (const patron of [COMENTARIOS, ...BLOQUES_DEL_PROGRAMA, ...ETIQUETAS_DE_RELLENO]) {
    limpio = limpio.replace(patron, "");
  }
  return limpio;
}

/** Una etiqueta o un comentario, con los valores entre comillas bien leídos. */
const PIEZAS =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[a-zA-Z][a-zA-Z0-9:_-]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g;

/** Las marcas de formato: las únicas que se desenredan. */
const FORMATO = new Set(["b", "strong", "i", "em", "u", "ins", "s", "strike", "del", "code"]);

/** Las etiquetas que no se ven: solo llevan un estilo o un color. */
const SIN_NOMBRE_APARENTE = new Set(["span", "font"]);

/** Un color hexadecimal, que es lo único que el editor sabe leer. */
const COLOR_HEXADECIMAL = "#[0-9a-f]{3,8}";

/** `color:` o `background-color:` dentro de un `style`. */
const COLOR_EN_ESTILO = new RegExp(
  String.raw`(?:^|;)\s*(color|background(?:-color)?)\s*:\s*(${COLOR_HEXADECIMAL})`,
  "i",
);

/** El `color` o el `bgcolor` con el que se escribía el color antes de los estilos. */
const COLOR_EN_ATRIBUTO = new RegExp(
  String.raw`\s(color|bgcolor)\s*=\s*["']?(${COLOR_HEXADECIMAL})["']?`,
  "i",
);

/**
 * El color de la etiqueta, como un `style` que el editor sí sabe leer.
 *
 * El editor solo entiende colores hexadecimales, así que un `rgb()` o un nombre
 * de color no se traducen: se pierden igual que si el HTML llegara sin limpiar, y
 * mantener aquí media tabla de colores sería duplicar la hoja de estilos del Word
 * dentro del editor.
 */
function estiloDeColor(etiqueta: string): string | null {
  const delEstilo = COLOR_EN_ESTILO.exec(etiqueta);
  const delAtributo = COLOR_EN_ATRIBUTO.exec(etiqueta);
  const declaraciones: string[] = [];
  if (delEstilo) declaraciones.push(`${delEstilo[1].toLowerCase()}:${delEstilo[2]}`);
  if (delAtributo) {
    const propiedad = delAtributo[1].toLowerCase() === "bgcolor" ? "background-color" : "color";
    declaraciones.push(`${propiedad}:${delAtributo[2]}`);
  }
  return declaraciones.length > 0 ? declaraciones.join(";") : null;
}

/** El nombre de una etiqueta en minúsculas y sin atributos. */
function nombreDe(etiqueta: string): string {
  return etiqueta.slice(1).replace(/^\//, "").replace(/[\s/>].*$/, "").toLowerCase();
}

/** Un valor de atributo, con o sin comillas. */
const VALOR = String.raw`(?:"[^"]*"|'[^']*'|[^\s>"']*)`;

/** Las comillas con las que venga el valor, que no son parte del valor. */
const SIN_COMILLAS = /^["']|["']$/g;

/**
 * Los atributos que no dicen nada de cómo se ve la línea.
 *
 * Se quitan con expresiones sueltas y **sin volver a montar la etiqueta**, para no
 * tocar los valores que sí importan: un `href` con una `&` o unas comillas dentro
 * se estropearía al reescribirlo, y una nota con un enlace estropeado es una nota
 * que ya no se puede abrir. El único que se vuelve a escribir es el `style`, y
 * solo con las declaraciones que quedan, entre comillas dobles.
 */
function limpiarAtributos(etiqueta: string): string {
  let limpio = etiqueta
    // Los `mso-*` son para el Word, no para la nota.
    .replace(new RegExp(String.raw`\smso-[\w-]+\s*=\s*${VALOR}`, "gi"), "")
    // `o:spid`, `w:rsidR`, `v:shapes`… solo existen porque el HTML es de Office.
    .replace(new RegExp(String.raw`\s[owvm]:[\w-]+\s*=\s*${VALOR}`, "gi"), "")
    .replace(new RegExp(String.raw`\sxmlns(?::[\w-]+)?\s*=\s*${VALOR}`, "gi"), "")
    // `class="MsoNormal"` dice qué plantilla de Word se usó, no cómo se ve la línea.
    .replace(new RegExp(String.raw`\sclass\s*=\s*(${VALOR})`, "gi"), (todo, valor: string) =>
      /\bmso/i.test(valor.replace(SIN_COMILLAS, "")) ? "" : todo,
    );
  // Del `style` se va lo que es de Word; el resto se queda.
  limpio = limpio.replace(
    new RegExp(String.raw`\sstyle\s*=\s*(${VALOR})`, "gi"),
    (_todo, valor: string) => {
      const declaraciones = valor
        .replace(SIN_COMILLAS, "")
        .split(";")
        .map((declaracion) => declaracion.trim())
        .filter((declaracion) => declaracion.length > 0 && !/mso/i.test(declaracion));
      return declaraciones.length > 0 ? ` style="${declaraciones.join(";")}"` : "";
    },
  );
  return limpio;
}

/**
 * Devuelve bien anidadas las marcas de formato.
 *
 * Va etiqueta a etiqueta con una pila de las marcas abiertas. Al cerrar una que
 * tiene otras por encima, cierra primero las de encima: en la pila solo hay
 * marcas, así que lo único que se pierde es la forma de la etiqueta, no una letra
 * del texto. Un cierre que no está en la pila no cierra nada y se tira, que es lo
 * que hace falta con el `</b>` que Word deja suelto al final de un párrafo.
 *
 * Al final se cierra lo que quede abierto, para que el HTML que sale esté
 * formado: una `<b>` sin cerrar se lee como texto en negrita hasta el final de la
 * nota.
 */
function desenredar(html: string): string {
  let salida = "";
  let cursor = 0;
  const marcas: string[] = [];
  // Los `<span>` y `<font>` que sí se quedan, por si hay que cerrar el que
  // corresponde: un `<font color>` sale como `<span style="color:…">` porque es lo
  // único que la marca de color del editor sabe leer.
  const conColor: string[] = [];

  for (const pieza of html.matchAll(PIEZAS)) {
    const donde = pieza.index ?? 0;
    salida += html.slice(cursor, donde);
    cursor = donde + pieza[0].length;
    const etiqueta = pieza[0];
    const nombre = nombreDe(etiqueta);
    const cierre = etiqueta.startsWith("</");

    if (FORMATO.has(nombre)) {
      if (/\/>$/.test(etiqueta)) continue;
      const abierta = marcas.lastIndexOf(nombre);
      if (!cierre) {
        // Dos `<b>` seguidos marcan lo mismo: con uno basta. Anidar un formato en
        // sí mismo no lo ve nadie, pero deja el HTML lleno de cierres que no
        // cuadran con nada.
        if (abierta >= 0) continue;
        marcas.push(nombre);
        salida += limpiarAtributos(etiqueta);
        continue;
      }
      if (abierta < 0) continue;
      while (marcas.length > abierta + 1) salida += `</${marcas.pop()}>`;
      marcas.pop();
      salida += `</${nombre}>`;
      continue;
    }

    if (SIN_NOMBRE_APARENTE.has(nombre)) {
      if (/\/>$/.test(etiqueta)) continue;
      const estilo = estiloDeColor(etiqueta);
      if (cierre) {
        // El cierre se lleva el último color que se quedó puesto, sea del mismo
        // nombre o no: es la misma política que con las marcas, y en estos
        // `<span>` de Office los cierres tampoco cuadran con las aperturas.
        const abierto = conColor.pop();
        if (abierto) salida += `</${abierto}>`;
        continue;
      }
      if (!estilo) continue;
      conColor.push("span");
      salida += `<span style="${estilo}">`;
      continue;
    }

    salida += limpiarAtributos(etiqueta);
  }

  salida += html.slice(cursor);
  for (let indice = marcas.length - 1; indice >= 0; indice -= 1) salida += `</${marcas[indice]}>`;
  while (conColor.length > 0) salida += `</${conColor.pop()}>`;
  return salida;
}

interface PasteNoteOptions {
  /** Quién se entera cuando un pegado no se pudo convertir. */
  report?: ReportFailure;
}

/**
 * El pegado de la nota: Markdown que llega de fuera y HTML de Office limpio.
 *
 * No añade nodos ni marcas —solo decide qué se inserta y con qué forma—, así que
 * el esquema y el Markdown que salen son los del registro de extensiones.
 */
export const PasteNote = Extension.create<PasteNoteOptions>({
  name: "notePaste",

  addOptions() {
    return {};
  },

  addProseMirrorPlugins() {
    const report = this.options.report;
    return [
      new Plugin({
        key: new PluginKey("notePaste"),
        props: propsDePegado({
          gestor: () => this.editor.markdown ?? null,
          report,
        }),
      }),
    ];
  },
});