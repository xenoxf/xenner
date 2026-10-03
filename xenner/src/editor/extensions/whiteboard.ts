import { Node } from "@tiptap/core";
import type { NodeViewRendererProps } from "@tiptap/core";
import type { NodeView } from "@tiptap/pm/view";

import { isDrawingTool } from "../../data/drawing.ts";

/** Título de la imagen que representa una pizarra en el Markdown. */
export const WHITEBOARD_CAPTION = "xenner:pizarra";

/** Texto alternativo de la imagen, que es lo que se ve si algo no se carga. */
const WHITEBOARD_ALT = "Pizarra";

export interface DrawingPreviewVisibility {
  /** El lienzo ya está montado. */
  editing: boolean;
  /** El lienzo se está abriendo (guarda asíncrona de otra pizarra). */
  starting: boolean;
  /** El SVG tiene al menos una figura. */
  hasContent: boolean;
}

/**
 * Si el nodo debe mostrar la imagen del dibujo o dejarla paso al lienzo.
 *
 * El editor se incrusta en el MISMO nodo que la vista previa, de modo que
 * mostrarlas a la vez pone el lienzo DEBAJO del dibujo en vez de en su lugar.
 * Regla: la imagen solo se ve con el editor cerrado y con algo que enseñar; un
 * borrador recién creado no debe dejar un tablero en blanco de 320x200.
 */
export function shouldShowDrawingPreview(state: DrawingPreviewVisibility): boolean {
  return !state.editing && !state.starting && state.hasContent;
}

/**
 * Solo se acepta un SVG en `data:`.
 *
 * Es lo que guarda `onSave` y lo que distingue una pizarra de una imagen
 * cualquiera: una nota podría traer `![Pizarra](.assets/dibujo.svg
 * "xenner:pizarra")` escrito a mano, y eso es una imagen con un pie, no un
 * lienzo. Aceptarlo convertiría en pizarra un archivo que no se puede editar.
 */
export function isWhiteboardSource(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]*={0,2}$/.test(value)
  );
}

/**
 * `![Pizarra](<src> "xenner:pizarra")`. El `src` no lleva espacios (es base64).
 *
 * El `(\S*)` acepta un destino **vacío**: es lo que escribe el propio
 * serializador de una pizarra a la que todavía no se le ha guardado un dibujo
 * (`![Pizarra]( "xenner:pizarra")`). Con `+` esa forma no era una pizarra, y al
 * releer la nota el bloque se convertía en una imagen rota cuyo `src` era el
 * texto literal `"xenner:pizarra"` — se perdía el dibujo para siempre.
 */
const WHITEBOARD_MARKDOWN = /^!\[Pizarra\]\(\s*(\S*)\s+"xenner:pizarra"\s*\)/;

/**
 * Lo que la app le pasa al nodo.
 *
 * El motor no dibuja: solo guarda y borra, y la vista rica la inyecta quien tenga
 * Solid. Sin `renderNodeView` el nodo se pinta con su `renderHTML`, que ya
 * enseña el dibujo, y eso es suficiente para abrir la nota y para probarlo en
 * Node sin navegador.
 */
export interface WhiteboardViewOptions {
  /** Guarda el SVG y devuelve el nuevo `src` (o `null` si no se pudo). */
  onSave(
    svg: string,
    currentSrc: string,
    options?: { notify?: boolean; copy?: boolean },
  ): Promise<string | null>;
  /** Borra el asset de la pizarra cuando el dibujo acaba vacío. */
  onDeleteAsset?(currentSrc: string): Promise<void>;
  /**
   * Vista de nodo. La app la inyecta; sin ella el motor pone una vista plana
   * (`<div><img></div>`) que es suficiente para los tests de Node.
   */
  renderNodeView?: (props: NodeViewRendererProps) => unknown;
}

interface WhiteboardOptions {
  renderNodeView?: WhiteboardViewOptions["renderNodeView"];
}

/**
 * La pizarra: un dibujo de la nota que se abre en un lienzo encima.
 *
 * Es un bloque atómico y draggedable —se mueve con la nota sin entrar en el
 * lienzo— cuyo contenido real es un SVG en `data:`. En el Markdown es una imagen
 * con el título `xenner:pizarra`, que es como la conocían las notas de antes.
 */
export const Whiteboard = Node.create<WhiteboardOptions>({
  name: "whiteboard",
  group: "block",
  atom: true,
  // El bloque se puede mover dentro de la nota sin entrar en la pizarra.
  draggable: true,
  isolating: true,
  selectable: true,

  addOptions() {
    return {};
  },

  addAttributes() {
    return {
      src: { default: "" },
      tool: { default: "select" },
      draft: { default: false },
      drawingId: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="whiteboard"]',
        getAttrs: (element) => {
          const src = element.getAttribute("data-src") ?? "";
          if (!isWhiteboardSource(src)) return false;
          const tool = element.getAttribute("data-tool");
          return {
            src,
            tool: isDrawingTool(tool) ? tool : "select",
            draft: element.getAttribute("data-draft") === "true",
            drawingId: element.getAttribute("data-drawing-id") ?? "",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attributes: Record<string, string> = {
      "data-type": "whiteboard",
      "data-src": String(HTMLAttributes.src ?? ""),
      "data-tool": String(HTMLAttributes.tool ?? "select"),
      "data-draft": String(Boolean(HTMLAttributes.draft)),
      "data-drawing-id": String(HTMLAttributes.drawingId ?? ""),
    };
    const src = String(HTMLAttributes.src ?? "");
    // Sin lienzo inyectado el nodo enseña el dibujo directamente: una nota con
    // una pizarra tiene que verse aunque nada sepa abrirla.
    if (!src) return ["div", attributes];
    return ["div", attributes, ["img", { src, alt: WHITEBOARD_ALT, draggable: "false" }]];
  },

  markdownTokenizer: {
    name: "whiteboard",
    level: "block",
    // `start` es la pista que busca marked para no analizar el texto entero en
    // cada bloque: basta con el comienzo de la forma. El `^` del patrón es lo
    // que decide que la pizarra sea un bloque entero y no una imagen en línea.
    start: (source) => source.search(/!\[Pizarra\]/),
    tokenize(source) {
      const match = WHITEBOARD_MARKDOWN.exec(source);
      if (!match) return undefined;
      return { type: "whiteboard", raw: match[0], src: match[1] };
    },
  },

  parseMarkdown(token) {
    const src = typeof token.src === "string" ? token.src : "";
    // Sin `src` no hay dibujo todavía, pero el bloque es una pizarra y tiene que
    // seguir siéndolo al releer la nota: es lo que escribe `renderMarkdown`.
    if (!src || isWhiteboardSource(src)) {
      return {
        type: "whiteboard",
        attrs: { src, tool: "select", draft: !src, drawingId: "" },
      };
    }
    // Dice ser una pizarra pero no lo es: un archivo suelto o una `data:` que
    // no es SVG. Se enseña como la imagen que es, en vez de abrir un lienzo
    // vacío sobre algo que no se puede editar, y sin perder la referencia.
    return {
      type: "noteImage",
      attrs: { src, alt: WHITEBOARD_ALT, title: WHITEBOARD_CAPTION },
    };
  },

  renderMarkdown(node) {
    const src = String(node.attrs?.src ?? "");
    // Con `src` vacío sale `![Pizarra]( "xenner:pizarra")`, que es justo lo que
    // el tokenizador de arriba sabe volver a leer como pizarra. Escribir una
    // forma que luego no se sabe leer es cómo una nota pierde un dibujo.
    return `![${WHITEBOARD_ALT}](${src} "${WHITEBOARD_CAPTION}")`;
  },

  addNodeView() {
    const render = this.options.renderNodeView;
    // Sin vista inyectada, o sin navegador, el nodo se pinta con su `renderHTML`.
    if (!render || typeof document === "undefined") return null;
    return (props: NodeViewRendererProps): NodeView => render(props) as NodeView;
  },
});