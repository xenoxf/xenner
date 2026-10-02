import type { EditorBlockType } from "../types/editor";

/**
 * Un tipo de bloque de texto, con lo que necesitan las dos superficies que lo
 * ofrecen: el dock de abajo y el mini menú que sale encima del texto
 * seleccionado.
 *
 * `icon` es SVG crudo a propósito. El dock lo pinta como componente de Solid
 * (`components/ui/Icons.tsx`) porque le puede dar color del tema, pero la barra
 * de Crepe solo acepta cadenas de markup:_innerHTML_ sobre ellas. Las dos
 * formas conviven sin que el mismo dibujo tenga dos versiones distintas, porque
 * las dos salen del mismo `path`.
 */
export interface EditorBlockItem {
  id: EditorBlockType;
  label: string;
  /** SVG crudo, el que espera la barra flotante de Crepe. */
  icon: string;
  /** Para el buscador del dock: lo que alguien escribiría para encontrarlo. */
  keywords: string;
}

const icon = (paths: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

/** Los mismos trazos que `components/ui/Icons.tsx`, en markup. */
export const EDITOR_BLOCKS: readonly EditorBlockItem[] = [
  {
    id: "paragraph",
    label: "Texto",
    icon: icon(`<path d="M5 5h14M12 5v14M8 19h8" />`),
    keywords: "texto parrafo normal cuerpo",
  },
  {
    id: "heading1",
    label: "Título 1",
    icon: icon(`<path d="M4 5v14M12 5v14M4 12h8M17 8.5V18M14.5 10.5 17 8.5l2.5 2" />`),
    keywords: "titulo 1 h1 encabezado principal",
  },
  {
    id: "heading2",
    label: "Título 2",
    icon: icon(`<path d="M4 5v14M12 5v14M4 12h8M15 10a2 2 0 0 1 4 0c0 1.5-2 2-2 4h4" />`),
    keywords: "titulo 2 h2 encabezado subtitulo",
  },
  {
    id: "heading3",
    label: "Título 3",
    icon: icon(`<path d="M4 5v14M12 5v14M4 12h8M15.5 8.5c2.5-1.8 4.5.6 2 2.5 3 1.5 1 4.8-2 3.5" />`),
    keywords: "titulo 3 h3 encabezado",
  },
  {
    id: "bullet",
    label: "Lista",
    icon: icon(
      `<path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 5.5h.01M4 11.5h.01M4 17.5h.01" stroke-width="2.4" />`,
    ),
    keywords: "lista viñetas vinetas puntos bullets",
  },
  {
    id: "ordered",
    label: "Numerada",
    icon: icon(`<path d="M9 6h11M9 12h11M9 18h11M3 5h2v4M3 15.5c0-1 2.5-1.2 2.5.2 0 1-2.5 1.4-2.5 2.8h3M3 10h2" />`),
    keywords: "numerada numeros ordenados ordered",
  },
  {
    id: "quote",
    label: "Cita",
    icon: icon(`<path d="M5 7h5v5H6.5C6.5 15 8 17 10 18M14 7h5v5h-3.5c0 3 1.5 5 3.5 6" />`),
    keywords: "cita comilla entrecomillado blockquote",
  },
];

export function editorBlockItem(id: EditorBlockType): EditorBlockItem | undefined {
  return EDITOR_BLOCKS.find((item) => item.id === id);
}