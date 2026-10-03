import { Node, ResizableNodeView } from "@tiptap/core";
import type { NodeViewRendererProps, ResizableNodeViewDirection } from "@tiptap/core";
import type { NodeView } from "@tiptap/pm/view";
import type { DOMOutputSpec } from "@tiptap/pm/model";

/**
 * Las tres piezas de una referencia a imagen, como patrones sueltos.
 *
 * Viven aquí, y no metidas en el `RegExp` de abajo, porque **otro módulo tiene
 * que reconocer las mismas imágenes**: `markdown/assets.ts` sustituye cada
 * `./.assets/…` por su `data:` URL antes de que el Markdown llegue al gestor. Si
 * los dos leen formas distintas, el editor acaba enseñando un hueco donde el
 * propio editor acaba de escribir la imagen.
 */
export const IMAGE_MARKDOWN_PARTS = {
  /** El pie: `\]` y `\\` van escapados, y un salto de línea también vale. */
  alt: String.raw`(?:\\.|[^\]\\])*`,
  /**
   * El destino: entre `<` y `>`, o suelto **con paréntesis balanceados**.
   *
   * Los paréntesis balanceados no son un capricho: `![a](captura(1).png)` es
   * Markdown válido de verdad, y es justo como se llaman los ficheros que
   * exporta un móvil o una captura de pantalla. Antes esta forma no la leía
   * nadie y la imagen **desaparecía**, dejando además un documento de Tiptap
   * inválido (`text` suelto dentro de `doc`). Solo un nivel de anidado, que es
   * todo lo que se encuentra en el mundo real.
   */
  destination: String.raw`<[^<>]*>|(?:[^\s()]|\((?:[^\s()])*\))*`,
  /** El título, opcional: `"…"`, `'…'` o `(…)`. */
  title: String.raw`(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?`,
} as const;

/**
 * `![pie](src "titulo")` cuando es lo único que hay en la línea.
 *
 * El `(?=\s*(?:\r?\n|$))` del final es lo que mantiene el nodo siendo de
 * bloque: una imagen escrita dentro de un párrafo no puede ser un bloque, así
 * que se deja como texto y no se parte la frase en dos.
 */
const IMAGE_MARKDOWN = new RegExp(
  `^!\\[(${IMAGE_MARKDOWN_PARTS.alt})\\]\\(\\s*(${IMAGE_MARKDOWN_PARTS.destination})(${IMAGE_MARKDOWN_PARTS.title})\\s*\\)(?=\\s*(?:\\r?\\n|$))`,
);

/** El título va entre comillas; las de estilo `(...)` no se emiten, se leen. */
const TITLE = /^(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\(((?:\\.|[^)\\])*)\))$/;

/** `<` entre paréntesis: `![a](<con espacios.png>)` es Markdown válido. */
const ANGLED_SOURCE = /^<([^<>]*)>$/;

/**
 * Cómo se guarda el tamaño y la alineación de una imagen en Markdown.
 *
 * Markdown **no tiene** forma de decir el tamaño ni la alineación de una imagen.
 * Los dos se guardan en el "título", que es el único sitio de la sintaxis donde
 * caben sin romper nada, y con un prefijo `@` que los hace inequívocos:
 *
 * ```
 * ![Pie de la foto](./.assets/captura.png "Pie de la foto @600 @center")
 * ```
 *
 * Por qué `@`: un número suelto al final («Foto 2024») se confundiría con un ancho,
 * y unas palabras sueltas («Foto center») con una alineación. Con `@` delante no
 * hay forma de confundirlo con un texto, y **otro visor de Markdown no se rompe**:
 * enseña el título entero como `title` y hace caso omiso de lo que no conoce.
 * Degrada sin perder, que es lo único honesto aquí.
 *
 * Lo que no se guarda es la **altura**: se deduce de la imagen, y un segundo
 * número puede quedarse viejo si el fichero cambia.
 */
const WIDTH_TOKEN = /^@(\d{2,4})$/;
const ALIGN_TOKEN = /^@(left|center|right)$/;

/** Las alineaciones que se pueden pedir. */
export const IMAGE_ALIGNS = ["left", "center", "right"] as const;
export type ImageAlign = (typeof IMAGE_ALIGNS)[number];

export function isImageAlign(value: unknown): value is ImageAlign {
  return typeof value === "string" && (IMAGE_ALIGNS as readonly string[]).includes(value);
}

/** Los tres botones de alineación: glifo, nombre accesible y `title`. */
const ALINEAR_ICONOS: Record<ImageAlign, string> = {
  left: "⟵",
  center: "⟷",
  right: "⟶",
};
const ALINEAR_TEXTOS: Record<ImageAlign, string> = {
  left: "Alinear a la izquierda",
  center: "Centrar",
  right: "Alinear a la derecha",
};

/**
 * Solo por la derecha y por abajo.
 *
 * Estirar por la esquina inferior derecha es el gesto de todo el mundo, y cuatro
 * tiradores encima de una foto son cuatro cosas más que estorban al leer.
 */
const DIRECCIONES_RESIZE: ResizableNodeViewDirection[] = ["right", "bottom", "bottom-right"];

interface ImageGeometry {
  /** El tooltip: el título tal cual, sin la geometría. */
  title: string;
  width: number | null;
  align: ImageAlign;
}

/** Un ancho fuera de esto es un número escrito a mano, no un tamaño elegido. */
function esAnchoDeImagen(value: number): boolean {
  return Number.isFinite(value) && value >= 40 && value <= 4000;
}

/**
 * Separa el título en su tooltip y su geometría.
 *
 * Se lee **de derecha a izquierda** y se para en el primer token que no es
 * geometría: lo que quede a la izquierda es el título, intacto, aunque se le
 * parezca.
 */
export function readImageGeometry(title: string): ImageGeometry {
  const tokens = title.trim().split(/\s+/).filter(Boolean);
  let width: number | null = null;
  let align: ImageAlign = "left";
  while (tokens.length > 0) {
    const token = tokens[tokens.length - 1] as string;
    const asWidth = WIDTH_TOKEN.exec(token);
    if (asWidth && width === null && esAnchoDeImagen(Number(asWidth[1]))) {
      width = Number(asWidth[1]);
      tokens.pop();
      continue;
    }
    const asAlign = ALIGN_TOKEN.exec(token);
    if (asAlign && isImageAlign(asAlign[1]) && align === "left") {
      align = asAlign[1];
      tokens.pop();
      continue;
    }
    break;
  }
  return { title: tokens.join(" "), width, align };
}

/** Vuelve a juntar el tooltip con la geometría. Sin geometría, solo el tooltip. */
export function writeImageGeometry(title: string, width: unknown, align: unknown): string {
  const parts: string[] = [];
  const trimmed = title.trim();
  if (trimmed) parts.push(trimmed);
  const ancho = typeof width === "number" && esAnchoDeImagen(width) ? Math.round(width) : null;
  if (ancho !== null) parts.push(`@${ancho}`);
  if (isImageAlign(align) && align !== "left") parts.push(`@${align}`);
  return parts.join(" ");
}

/** Un `width: 640px` del DOM, o `null` si no hay o no es creíble. */
function anchoDe(style: string | undefined): number | null {
  const value = Number.parseFloat((style ?? "").replace(/px$/, "").trim());
  return esAnchoDeImagen(value) ? Math.round(value) : null;
}

function alinearDe(value: string | null): ImageAlign {
  return isImageAlign(value) ? value : "left";
}

/** Los estilos de la figura, hechos a mano para que no dependan de CSS. */
function estilosDeFigura(align: ImageAlign, width: number | null): string {
  const declarations: string[] = [];
  // `margin-inline` en vez de `margin-left/right`: así el orden de escritura se
  // respeta igual en un tema de derecha a izquierda.
  if (align === "center") declarations.push("margin-inline: auto");
  if (align === "right") declarations.push("margin-inline-start: auto");
  if (width !== null) declarations.push(`width: ${width}px`);
  return declarations.join("; ");
}

/** Lo que `\c` significa de verdad dentro de un `alt`, un título o un `src`. */
const ESCAPED = /\\([\s\S])/g;

/** Un `src` con paréntesis o espacios solo cabe entre `<` y `>`. */
const NEEDS_ANGLES = /[()\s]/;

function unescapeMarkdown(value: string): string {
  return value.replace(ESCAPED, "$1");
}

/** Cierra el pie y el título: sin esto, un `]` en el pie rompe la imagen entera. */
function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\\\]])/g, "\\$1");
}

function escapeMarkdownTitle(value: string): string {
  return value.replace(/([\\"])/g, "\\$1");
}

/** El `src` como lo lee Markdown, con `<>` si no cabe así. */
function writeSource(value: string): string {
  return NEEDS_ANGLES.test(value) ? `<${value}>` : value;
}

function readTitle(raw: string): string {
  const match = TITLE.exec(raw.trim());
  if (!match) return "";
  return unescapeMarkdown(match[1] ?? match[2] ?? match[3] ?? "");
}

/**
 * El destino tal cual lo lee Markdown: sin los `<>` y sin las barras de escape.
 *
 * Lo exporta `markdown/assets.ts`, que tiene que encontrar **la misma** ruta de
 * `.assets` que el serializador acaba de escribir. Si los dos leyeran el destino
 * de otra manera, el asset no se cargaría y la imagen se abriría como un hueco.
 */
export function readImageSource(raw: string): string {
  const angled = ANGLED_SOURCE.exec(raw);
  return unescapeMarkdown(angled ? angled[1] ?? "" : raw);
}

/**
 * Una imagen de bloque con su pie debajo.
 *
 * Sustituye al `image-block` de Milkdown. En el Markdown es la imagen de
 * siempre —`![pie](src "titulo")`— porque una nota tiene que seguir siendo
 * legible fuera de aquí; el pie va en el `alt` y el `title` es el título.
 *
 * El pie se escribe en un `<input>` de la vista de nodo, no en un párrafo: es
 * texto de la imagen, no de la nota, y si fuera contenido del documento el
 * cursor se metería dentro de la imagen al pulsar debajo.
 *
 * El `src` acepta `data:` siempre, sin opción que lo apagara: las imágenes de
 * Xenner se pasan a base64 antes de entrar en el editor (ver `loadNoteAssets`)
 * porque el navegador no sabe leer `./.assets/captura.png`.
 */
export const NoteImage = Node.create({
  name: "noteImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      /** El pie de la imagen, que en el Markdown es el texto alternativo. */
      alt: { default: "" },
      /** El "título" del Markdown: aquí va el tooltip, sin la geometría. */
      title: { default: "", renderHTML: (attributes) => ({ "data-title": attributes.title }) },
      /**
       * El ancho en píxeles, o `null` para el natural de la imagen.
       *
       * `renderHTML` vacío a propósito: la anchura sale como estilo del `figure`,
       * hecho a mano en `renderHTML`, y no como un atributo `width` suelto que en
       * HTML además significaría otra cosa.
       */
      width: { default: null, renderHTML: () => ({}) },
      /** Qué lado se pega. Vive como `data-align` para poder darle estilo. */
      align: {
        default: "left" as ImageAlign,
        renderHTML: (attributes) => ({ "data-align": attributes.align }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-note-image]",
        getAttrs: (element) => {
          const image = element.querySelector("img");
          if (!image) return false;
          return {
            src: image.getAttribute("src") ?? "",
            alt: element.querySelector("figcaption")?.textContent ?? "",
            title: element.getAttribute("data-title") ?? "",
            width: anchoDe(element.style.width) ?? anchoDe(element.querySelector("img")?.style.width),
            align: alinearDe(element.getAttribute("data-align")),
          };
        },
      },
      {
        // El `src` puede ser una `data:` URL: es como llegan las imágenes.
        tag: "img[src]",
        getAttrs: (element) => {
          // Dentro de un párrafo el `<img>` es una imagen en línea de una frase,
          // y el esquema de bloque no puede guardarla ahí: mejor no tocarla.
          if (element.parentElement?.tagName === "P") return false;
          return {
            src: element.getAttribute("src") ?? "",
            alt: element.getAttribute("alt") ?? "",
            title: element.getAttribute("title") ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ node }): DOMOutputSpec {
    const src = String(node.attrs.src ?? "");
    const alt = String(node.attrs.alt ?? "");
    const title = String(node.attrs.title ?? "");
    const align = alinearDe(node.attrs.align as string | null);
    const width = typeof node.attrs.width === "number" ? Math.round(node.attrs.width) : null;
    const size = width !== null && esAnchoDeImagen(width) ? width : null;
    const styles = estilosDeFigura(align, size);
    const attributes: Record<string, string> = {
      class: "note-image",
      "data-note-image": "",
      "data-align": align,
    };
    if (title) attributes["data-title"] = title;
    if (styles) attributes.style = styles;
    // `height: auto` es lo que hace que la imagen **conserve su proporción** al
    // estrecharla o ensancharla, en vez de deformarse.
    const image: DOMOutputSpec = [
      "img",
      {
        src,
        alt: "",
        class: "note-image__picture",
        draggable: "false",
        style: size === null ? "" : `height: auto; width: ${size}px;`,
      },
    ];
    const pie = alt || title;
    if (!pie) return ["figure", attributes, image];
    return ["figure", attributes, image, ["figcaption", { class: "note-image__caption" }, pie]];
  },

  markdownTokenizer: {
    name: "noteImage",
    level: "block",
    // Cualquier imagen puede ser una: basta con el comienzo de la forma.
    start: (source) => source.search(/^!\[/m),
    tokenize(source) {
      const match = IMAGE_MARKDOWN.exec(source);
      if (!match) return undefined;
      const geometria = readImageGeometry(readTitle(match[3] ?? ""));
      return {
        type: "noteImage",
        raw: match[0],
        src: readImageSource(match[2] ?? ""),
        alt: unescapeMarkdown(match[1] ?? ""),
        title: geometria.title,
        width: geometria.width,
        align: geometria.align,
      };
    },
  },

  parseMarkdown(token) {
    return {
      type: "noteImage",
      attrs: {
        src: typeof token.src === "string" ? token.src : "",
        alt: typeof token.alt === "string" ? token.alt : "",
        title: typeof token.title === "string" ? token.title : "",
        width: typeof token.width === "number" ? token.width : null,
        align: isImageAlign(token.align) ? token.align : "left",
      },
    };
  },

  renderMarkdown(node) {
    const src = writeSource(String(node.attrs?.src ?? ""));
    const alt = escapeMarkdownLabel(String(node.attrs?.alt ?? ""));
    // La geometría se esconde **dentro** del título, que es el único hueco de la
    // sintaxis donde cabe sin inventar HTML ni ensuciar el `alt`.
    const title = escapeMarkdownTitle(writeImageGeometry(
      String(node.attrs?.title ?? ""),
      node.attrs?.width,
      node.attrs?.align,
    ));
    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
  },

  addNodeView() {
    // En Node no hay DOM: la nota se abre igual con el `renderHTML` de arriba.
    if (typeof document === "undefined") return null;
    return (props: NodeViewRendererProps): NodeView => createNoteImageView(props);
  },
});

/**
 * La vista de nodo, en DOM plano.
 *
 * No necesita Solid y no lo importa. Encima usa `ResizableNodeView` —el
 * redimensionable que trae `@tiptap/core`—, así que los tiradores de tamaño, la
 * proporción y la limpieza de oyentes son los de Tiptap y no un arrastre
 * reimplementado aquí. Debajo se pone lo que Tiptap no trae: el hueco de una
 * imagen que no se pudo cargar y el `<input>` del pie, que es texto de la imagen y
 * no de la nota (si fuera contenido, el cursor se metería dentro de la imagen al
 * pulsar debajo).
 *
 * Los tres botones de alineación viven **junto al pie**, que es donde los pone
 * Word cuando editas una imagen: aparecen con la imagen seleccionada, así que no
 * hay una barra de imagen siempre encima estorbando la lectura.
 */
function createNoteImageView(props: NodeViewRendererProps): NodeView {
  const image = document.createElement("img");
  image.className = "note-image__picture";
  image.alt = "";
  image.draggable = false;

  /**
   * El redimensionable avisa de los cambios por aquí, y también hay que
   * responderlos. Se declara antes de construirlo porque se le pasa al
   * constructor, y se le da su valor justo después: la vista necesita el
   * redimensionable para existir, y el redimensionable necesita esta función.
   */
  let alActualizar: (node: { type: unknown; attrs?: Record<string, unknown> }) => boolean = () =>
    true;

  const resizable = new ResizableNodeView({
    node: props.node,
    editor: props.editor,
    element: image,
    getPos: props.getPos,
    onUpdate: (node) => alActualizar(node),
    onCommit: (width) => {
      cambiarAtributo(props, { width: Math.round(width) });
    },
    options: {
      // Solo por la derecha y por abajo: estirar por la esquina inferior derecha
      // es el gesto de todo el mundo, y los cuatro tiradores encima de una foto
      // son cuatro cosas más que estorban al leer.
      directions: DIRECCIONES_RESIZE,
      min: { width: 120, height: 80 },
      max: { width: 4000, height: 4000 },
      // La proporción se mantiene **siempre**: una foto estirada es una foto
      // rota, y no hay forma de deshacerla una vez guardada.
      preserveAspectRatio: true,
      className: {
        container: "note-image",
        wrapper: "note-image__resizable",
        handle: "note-image__handle",
        resizing: "note-image--resizing",
      },
    },
  });

  const dom = resizable.dom;
  dom.dataset.noteImage = "";

  /** El hueco de una imagen que no se pudo cargar, con su pie al lado. */
  const missing = document.createElement("p");
  missing.className = "note-image__missing";

  const caption = document.createElement("input");
  caption.type = "text";
  caption.className = "note-image__caption";
  caption.placeholder = "Pie de la imagen";
  caption.spellcheck = false;
  caption.setAttribute("aria-label", "Pie de la imagen");

  const alineacion = document.createElement("div");
  alineacion.className = "note-image__align";
  alineacion.setAttribute("role", "group");
  alineacion.setAttribute("aria-label", "Alineación de la imagen");
  const botonesAlign = IMAGE_ALIGNS.map((valor) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "note-image__align-button";
    boton.dataset.align = valor;
    boton.textContent = ALINEAR_ICONOS[valor];
    boton.title = ALINEAR_TEXTOS[valor];
    boton.setAttribute("aria-label", ALINEAR_TEXTOS[valor]);
    boton.addEventListener("click", (event) => {
      event.preventDefault();
      cambiarAtributo(props, { align: valor });
    });
    alineacion.append(boton);
    return boton;
  });

  // Fuera del `wrapper` del redimensionable: dentro, los tiradores y el ancho
  //想把 también el pie y los botones.
  dom.append(missing, caption, alineacion);

  let actual = props.node;
  /**
   * Si el navegador dijo que el último `src` no se pudo cargar.
   *
   * Lo que NO vale para decidirlo es mirar `image.complete`/`naturalWidth`: un
   * `<img>` al que todavía no se le ha puesto el `src` ya está «completo» y mide
   * cero, así que toda imagen salía como rota al abrir la nota y —como no había
   * ningún `load` que lo desmintiera— se quedaba así hasta que se escribía en su
   * pie. Lo que lo dice es el propio `load` y el propio `error`.
   */
  let roto = false;

  const pintar = (): void => {
    const src = String(actual.attrs?.src ?? "");
    const alt = String(actual.attrs?.alt ?? "");
    // Una imagen rota no es un error: es una imagen que no se ve. El hueco deja
    // el pie a la vista para que el texto de la siga teniendo y sea editable.
    const ausente = !src || roto;
    dom.classList.toggle("note-image--missing", ausente);
    image.hidden = ausente;
    missing.hidden = !ausente;
    missing.textContent = alt || "Imagen";
    // Solo si es otro texto: reescribirlo mientras se escribe movería el cursor.
    if (caption.value !== alt) caption.value = alt;
    const align = alinearDe(actual.attrs?.align as string | null);
    // `flex` viene puesto por el redimensionable; esto decide de qué lado se pega.
    dom.style.justifyContent =
      align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
    for (const boton of botonesAlign) {
      boton.setAttribute("aria-pressed", String(boton.dataset.align === align));
    }
  };

  const sync = (node: { attrs?: Record<string, unknown> }): void => {
    actual = node as typeof actual;
    const src = String(node.attrs?.src ?? "");
    if (src) {
      if (image.getAttribute("src") !== src) {
        // Un `src` nuevo merece una oportunidad nueva.
        roto = false;
        image.src = src;
      }
    } else {
      image.removeAttribute("src");
    }
    pintar();
  };

  const onInput = (): void => {
    cambiarAtributo(props, { alt: caption.value });
  };
  const onLoad = (): void => {
    roto = false;
    pintar();
  };
  const onError = (): void => {
    roto = true;
    pintar();
  };

  caption.addEventListener("input", onInput);
  // Antes del primer `sync`: una imagen que ya estaba en caché puede disparar
  // `load` enseguida, y si el oyente llega tarde se pierde y la imagen se queda
  // creída rota.
  image.addEventListener("load", onLoad);
  image.addEventListener("error", onError);

  alActualizar = (node) => {
    if (node.type !== actual.type) return false;
    actual = node as typeof actual;
    sync(node);
    return true;
  };
  sync(actual);

  return {
    dom,
    stopEvent: (event: Event) =>
      // Todo lo que está **dentro** se queda aquí: el `<input>` del pie, los
      // botones de alineación y los tiradores de tamaño. Pero el contenedor
      // **no**: un clic en la figura tiene que llegar a ProseMirror para que la
      // imagen se seleccione, que es como se selecciona cualquier otra cosa.
      event.target instanceof HTMLElement &&
      event.target !== dom &&
      dom.contains(event.target),
    // Todo el subárbol es de esta vista, y lo que más importa es el `input` del
    // pie: si ProseMirror lo reanalizara, volvería a crear el input mientras se
    // está escribiendo en él y el cursor se perdería en cada tecla.
    ignoreMutation: (mutation: { target?: unknown }) =>
      dom.contains(mutation.target as globalThis.Node | null),
    update(node, decorations, innerDecorations) {
      // Todo lo de «el nodo es otro» lo decide el redimensionable, que es quien
      // tiene el nodo de referencia del constructor.
      return resizable.update(node, decorations, innerDecorations);
    },
    destroy() {
      caption.removeEventListener("input", onInput);
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      resizable.destroy();
      dom.remove();
    },
  };
}

/**
 * Cambia un atributo del nodo vivo, en una transacción como cualquier otro cambio.
 *
 * Se busca el nodo en el documento y no en la vista: a estas alturas puede ser
 * otro si la nota ha cambiado mientras se escribía. Si el nodo ya no está donde
 * estaba —lo han movido o lo han borrado— no se toca nada, porque escribir en la
 * posición equivocada es peor que no escribir.
 */
function cambiarAtributo(
  props: NodeViewRendererProps,
  cambios: Record<string, unknown>,
): boolean {
  const pos = props.getPos();
  if (pos === undefined) return false;
  const vivo = props.view.state.doc.nodeAt(pos);
  if (!vivo || vivo.type !== props.node.type) return false;
  const siguientes = { ...vivo.attrs, ...cambios };
  // Si no cambia nada, no hay transacción: si no, un simple clic deja una entrada
  // en el historial que no deshace nada.
  if (Object.entries(cambios).every(([clave, valor]) => vivo.attrs[clave] === valor)) return false;
  props.view.dispatch(props.view.state.tr.setNodeMarkup(pos, undefined, siguientes));
  return true;
}