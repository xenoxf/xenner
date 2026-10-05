import { Node } from "@tiptap/core";
import type { NodeViewRendererProps } from "@tiptap/core";
import type { NodeView } from "@tiptap/pm/view";

import { resolveAssetReference } from "../asset-paths.ts";

/**
 * Un adjunto dentro de la nota: una tarjeta, no un enlace.
 *
 * Hasta aquí un archivo adjuntado era un enlace de Markdown en una línea suelta, y
 * eso se leía como un enlace: no se sabía ni de qué tipo era el archivo, ni
 * cuánto pesaba, ni se podía abrir sin copiar la ruta a otro sitio. En un chat, un
 * archivo es una **tarjeta**: se ve lo que es, y un clic lo abre.
 *
 * ## Por qué un nodo y no un enlace decorado
 *
 * El enlace es contenido de una frase —«mira [este informe]—, y una tarjeta es un
 * bloque: necesita ser seleccionable, arrastrable y tener su propia vista. Un
 * enlace no puede tener vista de nodo, y un `WidgetType` de decoración se rompe en
 * cuanto el documento cambia alrededor. Por eso es un nodo.
 *
 * ## Cómo se escribe en el Markdown
 *
 * Como un enlace de Markdown de toda la vida, en su propia línea:
 *
 *     [informe.pdf](./.assets/9f2c1a0b7e4d.pdf)
 *
 * Es Markdown válido que se lee en cualquier parte, y no necesita HTML ni
 * atributos raros. Solo el tokenizer acepta enlaces que apuntan a `.assets`: un
 * `[Enlace a otra nota](nota.md)` escrito a mano sigue siendo un enlace normal, y
 * una `[página web](https://…)` también. Sin esa condición el editor se
 * apropiaría de los enlaces que alguien escribió para leerlos.
 *
 * ## Lo que no se guarda
 *
 * El tamaño del archivo. Se deduce del disco cuando se pinta la tarjeta y no se
 * serializa: es un dato que cambia con cada copia y no vale la pena que dos
 * archivos con los mismos bytes y distinto nombre se guarden como notas
 * distintas.
 */

/** Una ruta dentro de `.assets`, tal y como aparece en el Markdown de la nota. */
const ASSET_HREF = String.raw`\.?\/?\.assets\/[^\s()"'>]+`;

/**
 * Una línea que es **solo** un enlace a un asset.
 *
 * El `^` sin la `m` es lo que hace que esto sea un tokenizador y no una búsqueda:
 * tiene que casar en el sitio donde está el cursor, no en cualquier línea del
 * documento. Con la `m` puesta, un tokenizador encuentra la última línea de la nota
 * desde el principio, se la come como si fuera la primera y repite —con el
 * resultado de que una nota de seis líneas salía con cinco tarjetas de la última y
 * el resto de la nota en el aire—.
 *
 * Y el ancla de `^` con el final en `(?=[ \t]*(?:\n|$))` es lo que evita el error
 * gordo: un enlace dentro de una frase es un enlace, no una tarjeta, y sin ellos un
 * texto con un adjunto dentro se convertiría en media nota y media tarjeta.
 */
const ATTACHMENT_MARKDOWN = new RegExp(
  String.raw`^\[([^\]\n]*)\]\(\s*<?(${ASSET_HREF})>?\s*(?:"[^"\n]*")?\s*\)(?=[ \t]*(?:\n|$))`,
);

export const NoteAttachment = Node.create<NoteAttachmentOptions>({
  name: "noteAttachment",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      /** La ruta dentro de `.assets`, como está escrita en el Markdown. */
      href: { default: "" },
      /** El nombre que se enseña en la tarjeta. */
      label: { default: "" },
      /**
       * El tamaño en bytes, o `null` si no se sabe.
       *
       * `renderHTML` vacío: el peso no viaja en el HTML, se deduce al pintar.
       */
      size: { default: null, renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-note-attachment]",
        getAttrs: (element) => ({
          href: element.getAttribute("href") ?? "",
          label: element.textContent ?? "",
          size: tamanoDe(element.getAttribute("data-size")),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    const label = String(node.attrs.label ?? "") || String(node.attrs.href ?? "");
    const attributes: Record<string, string> = {
      "data-note-attachment": "",
      href: String(node.attrs.href ?? ""),
    };
    const size = node.attrs.size;
    if (typeof size === "number") attributes["data-size"] = String(size);
    return ["a", attributes, label];
  },

  markdownTokenizer: {
    name: "noteAttachment",
    level: "block",
    // Se busca el **comienzo** de una posible tarjeta. Sin esto el tokenizador se
    // prueba en cada línea y basta con que en algún sitio del documento haya un
    // enlace a `.assets` para que se pruebe en todas.
    start: (source) => source.search(/^\[[^\]\n]*\]\(\s*\.?\/?\.assets\//m),
    tokenize(source) {
      const match = ATTACHMENT_MARKDOWN.exec(source);
      if (!match) return undefined;
      return {
        type: "noteAttachment",
        raw: match[0],
        label: match[1] ?? "",
        href: match[2] ?? "",
      };
    },
  },

  parseMarkdown(token) {
    return {
      type: "noteAttachment",
      attrs: {
        href: typeof token.href === "string" ? token.href : "",
        label: typeof token.label === "string" ? token.label : "",
        size: null,
      },
    };
  },

  renderMarkdown(node) {
    const href = escapeDestination(String(node.attrs?.href ?? ""));
    const label = escapeLabel(String(node.attrs?.label ?? "")) || basenameDe(href);
    return `[${label}](${href})`;
  },

  addNodeView() {
    // Sin DOM no hay tarjeta, y sin acciones tampoco: en Node —los tests— la nota
    // se abre con el `renderHTML` de arriba, que es un enlace y se lee bien. En el
    // navegador la tarjeta es lo que hay.
    if (typeof document === "undefined") return null;
    const acciones = this.options.actions;
    if (!acciones) return null;
    return (props: NodeViewRendererProps): NodeView => createNoteAttachmentView(props, acciones);
  },
});

/** El `data-size` del HTML, si lo hay. */
function tamanoDe(valor: string | null): number | null {
  if (!valor) return null;
  const bytes = Number(valor);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}

/** El nombre del archivo, para cuando el enlace no trae rótulo. */
function basenameDe(href: string): string {
  const limpio = href.replace(/^\.?\//, "");
  const corte = limpio.lastIndexOf("/");
  return corte < 0 ? limpio : limpio.slice(corte + 1);
}

function escapeLabel(value: string): string {
  return value.replace(/([[\]])/g, "\\$1");
}

function escapeDestination(value: string): string {
  return /[()\s]/.test(value) ? `<${value}>` : value;
}

/**
 * La tarjeta, en DOM plano.
 *
 * Sin Solid, como la vista de la imagen: la vista de nodo la crea el motor y no
 * puede depender de la interfaz. Lo que sí hace falta aquí es lo de fuera —
 * copiar al portapapeles, preguntar al gateway por el archivo, enseñar el menú y
 * avisar de un fallo—, así que eso entra inyectado y la vista se queda con lógica
 * de dibujo.
 */
export interface NoteAttachmentActions {
  /** Abre el archivo con el programa del sistema. */
  open(notePath: string, assetPath: string): Promise<void>;
  /** Abre el explorador de archivos en la carpeta del archivo. */
  reveal(notePath: string, assetPath: string): Promise<void>;
  /** Copia al portapapeles la ruta o el enlace Markdown del archivo. */
  copy(que: "ruta" | "markdown", texto: string): Promise<void>;
  /** Avisa de un fallo, con su motivo. */
  report(what: string, error: unknown): void;
  /** Abre el menú de la tarjeta en el punto del clic derecho. */
  menu(event: MouseEvent, target: AttachmentMenuTarget): void;
  /** La nota que se está editando: de ahí sale la carpeta `.assets`. */
  notePath(): string;
}

/** Lo que el menú necesita saber de la tarjeta sobre la que se ha hecho clic. */
export interface AttachmentMenuTarget {
  notePath: string;
  href: string;
  label: string;
  open(): void;
  reveal(): void;
  copyPath(): void;
  copyMarkdown(): void;
}

/** Lo que la tarjeta necesita de fuera, y que solo la interfaz tiene. */
export interface NoteAttachmentOptions {
  actions?: NoteAttachmentActions;
}

function createNoteAttachmentView(
  props: NodeViewRendererProps,
  acciones: NoteAttachmentActions,
): NodeView {
  const card = document.createElement("div");
  card.className = "note-attachment";
  card.setAttribute("data-note-attachment-card", "");
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  const icono = document.createElement("span");
  icono.className = "note-attachment__icon";
  icono.setAttribute("aria-hidden", "true");

  const texto = document.createElement("span");
  texto.className = "note-attachment__text";

  const nombre = document.createElement("span");
  nombre.className = "note-attachment__name";

  const detalle = document.createElement("span");
  detalle.className = "note-attachment__meta";

  const accion = document.createElement("span");
  accion.className = "note-attachment__open";
  accion.textContent = "Abrir";

  texto.append(nombre, detalle);
  card.append(icono, texto, accion);

  let actual = props.node;

  const pintar = (): void => {
    const href = String(actual.attrs?.href ?? "");
    const etiqueta = String(actual.attrs?.label ?? "") || basenameDe(href);
    const bytes = typeof actual.attrs?.size === "number" ? actual.attrs.size : null;
    const tipo = extensionDe(etiqueta);
    nombre.textContent = etiqueta;
    // El tipo va dentro del icono: «PDF» o «MP4» se lee de un vistazo, y sin él el
    // cuadrado está vacío y la tarjeta parece un botón sin icono.
    icono.textContent = tipo ? tipo.slice(0, 4) : "•";
    icono.title = tipo ?? "";
    detalle.textContent = [tipo, bytes === null ? null : pesoDe(bytes)]
      .filter(Boolean)
      .join(" · ");
    const puedeAbrir = href !== "";
    card.setAttribute(
      "aria-label",
      puedeAbrir ? `Abrir el archivo ${etiqueta}` : `El archivo ${etiqueta} no está`,
    );
    card.dataset.broken = puedeAbrir ? "false" : "true";
  };

  /** La ruta que el gateway entiende: sin el `./` inicial. */
  const rutaDelAsset = (): string | null =>
    resolveAssetReference(acciones.notePath(), String(actual.attrs?.href ?? ""));

  const abrir = (): void => {
    const assetPath = rutaDelAsset();
    if (!assetPath) {
      acciones.report("este archivo no está en la biblioteca", String(actual.attrs?.href ?? ""));
      return;
    }
    void acciones
      .open(acciones.notePath(), assetPath)
      .catch((error: unknown) => acciones.report("no se pudo abrir el archivo", error));
  };

  const mostrarEnLaCarpeta = (): void => {
    const assetPath = rutaDelAsset();
    if (!assetPath) {
      acciones.report("este archivo no está en la biblioteca", String(actual.attrs?.href ?? ""));
      return;
    }
    void acciones
      .reveal(acciones.notePath(), assetPath)
      .catch((error: unknown) =>
        acciones.report("no se pudo abrir la carpeta del archivo", error),
      );
  };

  const copiar = (que: "ruta" | "markdown"): void => {
    const href = String(actual.attrs?.href ?? "");
    const etiqueta = String(actual.attrs?.label ?? "") || basenameDe(href);
    const texto = que === "ruta" ? href : `[${etiqueta}](${href})`;
    void acciones.copy(que, texto).catch((error: unknown) => acciones.report("no se pudo copiar", error));
  };

  const onClick = (): void => abrir();
  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    acciones.menu(event, {
      notePath: acciones.notePath(),
      href: String(actual.attrs?.href ?? ""),
      label: String(actual.attrs?.label ?? "") || basenameDe(String(actual.attrs?.href ?? "")),
      open: abrir,
      reveal: mostrarEnLaCarpeta,
      copyPath: () => copiar("ruta"),
      copyMarkdown: () => copiar("markdown"),
    });
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      abrir();
      return;
    }
    const command = event.ctrlKey || event.metaKey;
    if (!command) return;
    if (event.key.toLowerCase() === "c") {
      event.preventDefault();
      copiar(event.shiftKey ? "markdown" : "ruta");
    }
  };

  card.addEventListener("click", onClick);
  card.addEventListener("contextmenu", onContextMenu);
  card.addEventListener("keydown", onKeyDown);
  pintar();

  return {
    dom: card,
    // El clic en un nodo seleccionable tiene que llegar a ProseMirror —si no, la
    // tarjeta no se puede seleccionar ni arrastrar—, y el resto se queda aquí.
    stopEvent: (event: Event) => event.target !== card,
    ignoreMutation: (mutation: { target?: unknown }) => card.contains(mutation.target as globalThis.Node | null),
    update(node) {
      if (node.type !== actual.type) return false;
      actual = node as typeof actual;
      pintar();
      return true;
    },
    destroy() {
      card.removeEventListener("click", onClick);
      card.removeEventListener("contextmenu", onContextMenu);
      card.removeEventListener("keydown", onKeyDown);
      card.remove();
    },
  };
}

export { createNoteAttachmentView };

/** De un nombre de archivo, lo que alguien lee de un vistazo: el tipo. */
function extensionDe(nombre: string): string | null {
  const corte = nombre.lastIndexOf(".");
  if (corte <= 0 || corte === nombre.length - 1) return null;
  return nombre.slice(corte + 1).toUpperCase();
}

/** `240 KB`, `1,2 MB`: lo mismo que dice el explorador de archivos. */
export function pesoDe(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  if (bytes < 1_000_000_000) {
    const mb = bytes / 1_000_000;
    return `${mb < 10 ? mb.toFixed(1).replace(".", ",") : Math.round(mb)} MB`;
  }
  const gb = bytes / 1_000_000_000;
  return `${gb < 10 ? gb.toFixed(1).replace(".", ",") : Math.round(gb)} GB`;
}