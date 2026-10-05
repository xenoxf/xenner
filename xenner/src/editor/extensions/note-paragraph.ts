import { mergeAttributes, Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";

/**
 * El párrafo de Xenner, que además sabe en qué lado se pega.
 *
 * ## Por qué se escribe entero y no se extiende el de Tiptap
 *
 * Porque habría que duplicar sus dos funciones de Markdown igual —`parseMarkdown` y
 * `renderMarkdown`— y duplicarlas extendiendo no es mejor que duplicarlas
 * escribiéndolas: es lo mismo de largo y encima ata el editor a la versión exacta de
 * una dependencia para ganar `this.parent`. Aquí están las dos, con lo que hacen
 * fija: es el comportamiento que no se puede perder en una reescritura.
 *
 * ## Por qué hace falta una extensión para alinear
 *
 * Markdown no tiene forma de alinear un párrafo: no hay nada en la sintaxis que lo
 * diga. Así que alinear tiene que guardarse en algún sitio, y las dos opciones tienen
 * un precio distinto:
 *
 * - **No guardarlo** es perder el dato: quien alinea un párrafo y cierra la nota se
 *   encuentra con que al abrirla el texto está a la izquierda otra vez, sin aviso.
 * - **Guardarlo inventando sintaxis** —`::: centro`, `#centro`— es peor: la nota
 *   deja de ser Markdown y se ensucia con algo que ningún otro editor entiende.
 *
 * Lo que se hace aquí es lo estándar: el HTML de un párrafo, que GitHub, VS Code y
 * Obsidian leen sin problema —el texto se ve siempre; la alineación es lo único que
 * un lector de Markdown puede ignorar—. **Y solo cuando el párrafo no está a la
 * izquierda**, que es lo que pasa en el 95 % de las notas: una nota sin alinear es
 * Markdown puro y no lleva ni una etiqueta.
 *
 * ## Por qué un tokenizador propio y no `parseHTML`
 *
 * Tiptap sabe leer `<p align="center">` por la vía del HTML, pero solo en el
 * navegador: `parseHTMLToken` necesita un `DOMParser` y en Node —donde se prueba el
 * Markdown, porque no hace falta una ventana para comprobar que una ida y vuelta no
 * pierde una palabra— cae a tratar el HTML como texto. Con eso, el test del Markdown
 * no podría comprobar la alineación y el parser de la app y el de los tests serían
 * dos distintos. Con un tokenizador propio, la forma es la misma en los dos sitios.
 */

export const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;
/** `[number]` y no `[0]`: con `[0]` el tipo sería solo `"left"`. */
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export function isTextAlign(valor: unknown): valor is TextAlign {
  return typeof valor === "string" && (TEXT_ALIGNS as readonly string[]).includes(valor);
}

/** El lado que se pide, o el de por defecto si no es uno de los cuatro. */
export function alinearDe(valor: unknown): TextAlign {
  return isTextAlign(valor) ? valor : "left";
}

/**
 * Un párrafo alineado, de principio a fin.
 *
 * El `^` sin la `m` es lo que lo hace un tokenizador y no una búsqueda: tiene que
 * casar donde está el cursor, no en cualquier línea. Con la `m` puesta encuentra la
 * última alineación de la nota desde el principio y se la come como si fuera la
 * primera, repitiendo —y una nota de seis párrafos salía con seis del último y el
 * resto en el aire—.
 */
const ALIGNED_PARAGRAPH = new RegExp(
  String.raw`^<p\s+align="(${TEXT_ALIGNS.join("|")})"\s*>([\s\S]*?)<\/p>`,
);

const EMPTY_PARAGRAPH_MARKDOWN = "&nbsp;";
const NBSP_CHAR = "\u00A0";

/** Un tipo de token propio, para no pisar el del párrafo de Tiptap. */
const TOKEN_NAME = "alignedParagraph";

/** Lo que Tiptap le pasa a `parseMarkdown`. */
interface AlignHelpers {
  parseInline(tokens: unknown[]): JSONContent[];
  createNode(type: string, attrs?: unknown, content?: unknown[]): JSONContent;
}

/** Un token tal y como lo ve `parseMarkdown`. */
interface AlignToken {
  tokens?: { type?: string; raw?: string; text?: string }[];
  align?: unknown;
}

/** Lo que Tiptap le pasa a `renderMarkdown`. */
type RenderHelpers = { renderChildren(nodes: JSONContent[]): string };

/** El bloque anterior en la serialización: hace falta para los párrafos vacíos. */
interface RenderContext {
  previousNode?: JSONContent | null;
}

export const NoteParagraph = Node.create({
  name: "paragraph",
  // El de Tiptap trae `1000`. Van los dos en el editor y gana el último, que es el
  // que trae el atributo de alineación.
  priority: 1100,
  group: "block",
  content: "inline*",

  addOptions() {
    return { HTMLAttributes: {} as Record<string, unknown> };
  },

  addAttributes() {
    return {
      /**
       * De qué lado se pega el texto.
       *
       * Vive como `data-align` y no como `style` en línea por dos razones: así el
       * CSS lo decide y el HTML copiado lleva el dato legible, y un `style` pegado
       * se arrastra al pegar de otro sitio —quien centra un párrafo y luego pega
       * encima no quiere heredar el centro—.
       */
      align: {
        default: "left" as TextAlign,
        parseHTML: (element: HTMLElement) =>
          alinearDe(
            element.getAttribute("align") ?? element.getAttribute("data-align"),
          ),
        renderHTML: (attributes: { align?: unknown }) =>
          attributes.align === "left" ? {} : { "data-align": attributes.align },
      },
    };
  },

  parseHTML() {
    return [{ tag: "p" }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["p", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  /**
   * El párrafo de Tiptap, con la alineación encima.
   *
   * Lo del `&nbsp;` va primero porque es lo que hacía el párrafo de Tiptap y lo que
   * hay que seguir haciendo: un párrafo vacío se escribe como `&nbsp;` para que no
   * desaparezca, y sin esta comprobación dos vacíos seguidos se convertían en uno
   * solo al abrir la nota.
   */
  parseMarkdown(token: AlignToken, helpers: AlignHelpers): JSONContent {
    const tokens = token.tokens ?? [];
    const alineado = alinearDe(token.align);
    const contenido = helpers.parseInline(tokens);
    const esVacio =
      tokens.length === 1 &&
      tokens[0].type === "text" &&
      (tokens[0].raw === EMPTY_PARAGRAPH_MARKDOWN ||
        tokens[0].text === EMPTY_PARAGRAPH_MARKDOWN ||
        tokens[0].raw === NBSP_CHAR ||
        tokens[0].text === NBSP_CHAR) &&
      contenido.length === 1 &&
      contenido[0].type === "text" &&
      (contenido[0].text === EMPTY_PARAGRAPH_MARKDOWN || contenido[0].text === NBSP_CHAR);
    if (esVacio) return helpers.createNode("paragraph", { align: alineado }, []);
    if (alineado === "left") return helpers.createNode("paragraph", undefined, contenido);
    return helpers.createNode("paragraph", { align: alineado }, contenido);
  },

  /**
   * El párrafo de Tiptap cuando no hay nada que envolver, y `<p align>` cuando sí.
   *
   * Un párrafo a la izquierda sale como Markdown de siempre, sin etiquetas. Los
   * vacíos conservan su `&nbsp;` y su regla —dos vacíos seguidos se separan—:
   * envolverlos a mano los dejaría en un solo bloque.
   */
  renderMarkdown(node: JSONContent, h: RenderHelpers, ctx?: RenderContext): string {
    const contenido = node.content ?? [];
    if (contenido.length === 0) {
      const anterior = ctx?.previousNode;
      const dosVacios =
        anterior?.type === "paragraph" && (anterior.content ?? []).length === 0;
      const vacio = dosVacios ? EMPTY_PARAGRAPH_MARKDOWN : "";
      const alineado = alinearDe(node.attrs?.align);
      return alineado === "left" || vacio === ""
        ? vacio
        : `<p align="${alineado}">${vacio}</p>`;
    }
    const dentro = h.renderChildren(contenido);
    const alineado = alinearDe(node.attrs?.align);
    if (alineado === "left") return dentro;
    return `<p align="${alineado}">${dentro}</p>`;
  },

  markdownTokenizer: {
    // El nombre del tokenizador es el identificador de la extensión de `marked`, no
    // el tipo del token. El tipo que sale es `paragraph` —con `align` encima— porque
    // el registro de `@tiptap/markdown` busca el manejador por **tipo de token** y
    // este párrafo se registra una sola vez, bajo el nombre de su nodo. Así un solo
    // `parseMarkdown` atiende los dos casos: un párrafo normal y uno alineado.
    name: TOKEN_NAME,
    level: "block",
    start: (source: string) =>
      source.search(
        new RegExp(String.raw`^<p\s+align="(?:${TEXT_ALIGNS.join("|")})"\s*>`, "m"),
      ),
    tokenize(source, _tokens, helper) {
      const match = ALIGNED_PARAGRAPH.exec(source);
      if (!match) return undefined;
      const dentro = match[2] ?? "";
      return {
        type: "paragraph",
        raw: match[0],
        align: match[1] ?? "left",
        tokens: helper.inlineTokens(dentro),
      };
    },
  },

  addCommands() {
    return {
      setParagraph:
        () =>
        ({ commands }: { commands: { setNode(name: string): boolean } }) =>
          commands.setNode(this.name),
    };
  },
});

/**
 * De qué lado está lo que hay seleccionado, o `null` si hay más de uno.
 *
 * `null` no es «nada alineado»: es «no hay un único lado que poner en el botón», que
 * es lo que hace que el botón se vea apagado cuando la selección mezcla un párrafo
 * centrado con otro a la izquierda. Igual que el estilo de bloque, se lee del
 * documento vivo y no de una copia.
 *
 * Solo mira los párrafos de **primer nivel**, por lo mismo que `puedeAlinear`: un
 * párrafo dentro de una lista no se puede alinear sin romper la lista.
 */
export function alignInSelection(
  doc: ProseNode,
  desde: number,
  hasta: number,
): TextAlign | null {
  const vistos = new Set<TextAlign>();
  doc.forEach((nodo, offset) => {
    const fin = offset + nodo.nodeSize;
    if (offset >= hasta || fin <= desde) return;
    if (nodo.type.name === "paragraph") vistos.add(alinearDe(nodo.attrs.align));
  });
  if (vistos.size !== 1) return null;
  return [...vistos][0] ?? null;
}

/**
 * Si hay algún párrafo de primer nivel que se pueda alinear.
 *
 * Es lo que decide si los cuatro botones se encienden. Y es **falso dentro de una
 * lista** por una razón que no es de estilo: un párrafo dentro de un elemento de
 * lista sale del Markdown como `<p align>`, y eso parte la lista en dos al guardarla.
 * Es peor que un botón apagado: es una nota que cambia de forma al abrirla.
 */
export function puedeAlinear(doc: ProseNode, desde: number, hasta: number): boolean {
  let puede = false;
  doc.forEach((nodo, offset) => {
    const fin = offset + nodo.nodeSize;
    if (offset >= hasta || fin <= desde) return;
    if (nodo.type.name === "paragraph") puede = true;
  });
  return puede;
}