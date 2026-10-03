import { Mark } from "@tiptap/core";

/** El color que pone la barra flotante la primera vez que se elige color. */
export const DEFAULT_TEXT_COLOR = "#2563eb";

/** El fondo que pone la barra flotante la primera vez que se elige color. */
export const DEFAULT_TEXT_BACKGROUND = "#fef3c7";

/**
 * Acepta solo colores hexadecimales y los deja en minúsculas y forma larga.
 *
 * Es a propósito Gatekeeper: lo que se escribe en el Markdown acaba dentro de un
 * atributo `style`, y un `style="color: whatever"` allowlist mal puesto convierte
 * la nota en una puerta abierta. Un nombre de color (`red`) o un `rgb()` no se
 * aceptan aunque se vean razonables, porque lo que se guarda siempre es lo que da
 * un `<input type="color">`.
 */
export function normalizeTextColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const [red, green, blue] = color.slice(1).toLowerCase();
    return `#${red}${red}${green}${green}${blue}${blue}`;
  }
  return null;
}

/**
 * `<span …>` hasta el cierre real de la etiqueta.
 *
 * Los atributos van entre comillas, así que un `>` **dentro** de un valor
 * (`title="a>b"`, que es HTML legal) no cierra el span. Buscando solo hasta el
 * primer `>` el resto del texto se colaba dentro del color y el cierre sobrante
 * salía como texto suelto. Un valor con la comilla sin cerrar no es un span
 * nuestro: se deja como texto, que es lo honesto.
 */
const SPAN_ATTRIBUTES = String.raw`(?:"[^"]*"|'[^']*'|[^>"'])*`;
const SPAN_OPEN = new RegExp(`^<span\\b(${SPAN_ATTRIBUTES})>`, "i");

/** El mismo span, en cualquier punto: es lo que hace falta para contar anidados. */
const SPAN_OPEN_ANYWHERE = new RegExp(`<span\\b${SPAN_ATTRIBUTES}>`, "i");

/** El cierre que cierra el span abierto. Los spans pueden anidarse. */
const SPAN_CLOSE = /<\/span\s*>/i;

const DATA_COLOR = /\bdata-xenner-color\s*=\s*(["'])(#[0-9a-f]{3,8})\1/i;
const DATA_BACKGROUND = /\bdata-xenner-background\s*=\s*(["'])(#[0-9a-f]{3,8})\1/i;
const STYLE_ATTRIBUTE = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const STYLE_COLOR = /(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8})/i;
const STYLE_BACKGROUND = /(?:^|;)\s*background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/i;

interface StyledSpan {
  /** El `<span …>…</span>` entero, que es lo que `raw` tiene que llevar. */
  raw: string;
  /** Lo de dentro, que es lo que se vuelve a analizar como Markdown en línea. */
  inner: string;
  color: string;
  background: string;
}

/**
 * El `</span>` que cierra el span que se acaba de abrir.
 *
 * Los spans se pueden anidar —el color de una nota vieja puede haber metido uno
 * dentro de otro— y el primer `</span>` que aparece no es necesariamente el que
 * cierra: si no se cuentan, el resto del texto se quedaría dentro de la marca y
 * el cierre sobrante saldría como texto suelto.
 */
function findClosingSpan(body: string): { start: number; end: number } | null {
  let depth = 1;
  let cursor = 0;
  while (cursor < body.length) {
    const cierre = SPAN_CLOSE.exec(body.slice(cursor));
    if (!cierre) return null;
    const apertura = SPAN_OPEN_ANYWHERE.exec(body.slice(cursor));
    if (apertura && apertura.index < cierre.index) {
      depth += 1;
      cursor += apertura.index + apertura[0].length;
      continue;
    }
    depth -= 1;
    const start = cursor + cierre.index;
    if (depth === 0) return { start, end: start + cierre[0].length };
    cursor = start + cierre[0].length;
  }
  return null;
}

/**
 * Lee un span de color del principio de `source`.
 *
 * Se leen primero los `data-xenner-*`, que es lo que escribe este editor, y el
 * `style` queda como respaldo: hay notas escritas antes de que existieran los
 * atributos que solo llevan el color en la hoja de estilo. Un span sin color
 * hexadecimal no es nuestro (`null`) y lo deja al HTML normal.
 */
function readStyledSpan(source: string): StyledSpan | null {
  const open = SPAN_OPEN.exec(source);
  if (!open) return null;
  const rest = source.slice(open[0].length);
  const close = findClosingSpan(rest);
  if (!close) return null;

  const attributes = open[1] ?? "";
  const dataColor = DATA_COLOR.exec(attributes);
  const dataBackground = DATA_BACKGROUND.exec(attributes);
  const style = STYLE_ATTRIBUTE.exec(attributes);
  const styleValue = style?.[1] ?? style?.[2];
  const styleColor = styleValue ? STYLE_COLOR.exec(styleValue) : null;
  const styleBackground = styleValue ? STYLE_BACKGROUND.exec(styleValue) : null;
  const color = normalizeTextColor(dataColor?.[2]) ?? normalizeTextColor(styleColor?.[1]);
  const background =
    normalizeTextColor(dataBackground?.[2]) ?? normalizeTextColor(styleBackground?.[1]);
  if (!color && !background) return null;

  return {
    raw: source.slice(0, open[0].length + close.end),
    inner: rest.slice(0, close.start),
    color: color ?? "",
    background: background ?? "",
  };
}

/** El HTML que sale en la nota y el que se lee al pegarla. */
function styledSpanTag(color: string | null, background: string | null): string {
  const attributes: string[] = [];
  const styles: string[] = [];
  if (color) {
    attributes.push(`data-xenner-color="${color}"`);
    styles.push(`color:${color}`);
  }
  if (background) {
    attributes.push(`data-xenner-background="${background}"`);
    styles.push(`background-color:${background}`);
  }
  const style = styles.length ? ` style="${styles.join(";")}"` : "";
  return `<span ${attributes.join(" ")}${style}>`;
}

/**
 * Color de letra y de fondo del texto.
 *
 * En el Markdown es HTML en línea: `<span data-xenner-color="#ff0000"
 * style="color:#ff0000">…</span>`. Es exactamente lo que emitía Milkdown, y
 * tiene que seguir siendo idéntico porque hay notas ya escritas así: el
 * `data-` para no depender de la hoja de estilo y el `style` para que se vea
 * fuera de Xenner, en cualquier visor de Markdown.
 */
export const TextColor = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: { default: "" },
      background: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-xenner-color], span[data-xenner-background]",
        getAttrs: (element) => ({
          color: normalizeTextColor(element.getAttribute("data-xenner-color")) ?? "",
          background: normalizeTextColor(element.getAttribute("data-xenner-background")) ?? "",
        }),
      },
      {
        tag: "span[style]",
        getAttrs: (element) => {
          const style = element.getAttribute("style") ?? "";
          const color = normalizeTextColor(STYLE_COLOR.exec(style)?.[1]);
          const background = normalizeTextColor(STYLE_BACKGROUND.exec(style)?.[1]);
          // Sin color hexadecimal el span es de otra cosa (un resaltado del
          // navegador, un `span` de la vista previa): mejor no marcarlo.
          if (!color && !background) return false;
          return { color: color ?? "", background: background ?? "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const color = normalizeTextColor(HTMLAttributes.color);
    const background = normalizeTextColor(HTMLAttributes.background);
    const attributes: Record<string, string> = {};
    const styles: string[] = [];
    if (color) {
      attributes["data-xenner-color"] = color;
      styles.push(`color:${color}`);
    }
    if (background) {
      attributes["data-xenner-background"] = background;
      styles.push(`background-color:${background}`);
    }
    if (styles.length) attributes.style = styles.join(";");
    return ["span", attributes, 0];
  },

  markdownTokenizer: {
    name: "textColor",
    level: "inline",
    // El span solo puede empezar en un `<span`; no hace falta buscar más.
    start: (source) => source.search(/<span\b/i),
    tokenize(source, _tokens, lexer) {
      const span = readStyledSpan(source);
      if (!span) return undefined;
      return {
        type: "textColor",
        raw: span.raw,
        attrs: { color: span.color, background: span.background },
        // Lo de dentro vuelve a ser Markdown en línea: dentro del color sigue
        // habiendo negritas, enlaces y hasta otros colores.
        tokens: lexer.inlineTokens(span.inner),
      };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.applyMark("textColor", helpers.parseInline(token.tokens ?? []), {
      color: normalizeTextColor(token.attrs?.color) ?? "",
      background: normalizeTextColor(token.attrs?.background) ?? "",
    });
  },

  renderMarkdown(node, helpers) {
    const content = helpers.renderChildren(node);
    const color = normalizeTextColor(node.attrs?.color);
    const background = normalizeTextColor(node.attrs?.background);
    if (!color && !background) return content;
    return `${styledSpanTag(color, background)}${content}</span>`;
  },
});