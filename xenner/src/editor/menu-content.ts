import type { EditorBlockType } from "../types/editor.ts";
import { blockTypeAt } from "./block-type.ts";
import type { BlockDocument, BlockPosition } from "./block-type.ts";

/**
 * Todo lo que se le enseña a quien escribe, como **datos**.
 *
 * Antes esto vivía en dos sitios: la configuración de Crepe —que desaparecía
 * con el paquete— y `data/editor.ts`. Cada copia de un icono es una copia que
 * se puede quedar sin actualizar, así que ahora está todo aquí, junto, y sin
 * estado: ni manejadores ni callbacks. Lo que hay que hacer al elegir una
 * entrada es un `kind` y un `id`; el componente decide a qué comando llama.
 *
 * Las únicas funciones son **cuentas puras** sobre lo que ya está escrito —qué
 * estilo tiene este bloque, qué protocolo le falta a este enlace—, sin estado ni
 * efectos. Se ejecutan en Node, que es justo lo que las hace comprobables en vez
 * de sólo legibles.
 *
 * Los iconos son **markup** (`string`) y no componentes de Solid porque los
 * menús los pintan con `innerHTML`: es lo que espera la capa de interfaz, y un
 * SVG sin `viewBox` sale con el tamaño por defecto y se ve enorme al lado de
 * los demás.
 */

/** Los mismos trazos que `components/ui/Icons.tsx`, con su `viewBox`. */
const svg = (paths: string, width = 1.8): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export interface EditorBlockItem {
  id: EditorBlockType;
  label: string;
  /** SVG crudo: el menú lo pinta con `innerHTML`. */
  icon: string;
}

/** Los siete tipos de bloque, en el orden en que se leen. */
export const EDITOR_BLOCKS: readonly EditorBlockItem[] = [
  {
    id: "paragraph",
    label: "Texto",
    icon: svg(`<path d="M5 5h14M12 5v14M8 19h8" />`),
  },
  {
    id: "heading1",
    label: "Título 1",
    icon: svg(`<path d="M4 5v14M12 5v14M4 12h8M17 8.5V18M14.5 10.5 17 8.5l2.5 2" />`),
  },
  {
    id: "heading2",
    label: "Título 2",
    icon: svg(`<path d="M4 5v14M12 5v14M4 12h8M15 10a2 2 0 0 1 4 0c0 1.5-2 2-2 4h4" />`),
  },
  {
    id: "heading3",
    label: "Título 3",
    icon: svg(`<path d="M4 5v14M12 5v14M4 12h8M15.5 8.5c2.5-1.8 4.5.6 2 2.5 3 1.5 1 4.8-2 3.5" />`),
  },
  {
    id: "bullet",
    // «Viñetas» y no «Lista»: el rótulo tiene que decir **qué** lista es, porque al
    // lado hay una numerada y quien no sabe Markdown no tiene por qué saber que
    // una son puntos y la otra números. Es lo que pone Word.
    label: "Viñetas",
    icon: svg(
      `<path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 5.5h.01M4 11.5h.01M4 17.5h.01" stroke-width="2.4" />`,
    ),
  },
  {
    id: "ordered",
    label: "Numerada",
    icon: svg(`<path d="M9 6h11M9 12h11M9 18h11M3 5h2v4M3 15.5c0-1 2.5-1.2 2.5.2 0 1-2.5 1.4-2.5 2.8h3M3 10h2" />`),
  },
  {
    id: "quote",
    label: "Cita",
    icon: svg(`<path d="M5 7h5v5H6.5C6.5 15 8 17 10 18M14 7h5v5h-3.5c0 3 1.5 5 3.5 6" />`),
  },
];

/** Los siete, como los recorre la barra flotante. */
export const EDITOR_BLOCK_TYPES: readonly EditorBlockType[] = EDITOR_BLOCKS.map((item) => item.id);

/**
 * Lo que hay que hacer al elegir una entrada.
 *
 * Los nombres son los del nodo que se inserta —`codeBlock`, `taskList`—, y solo
 * `block` y `divider` se salen de esa regla porque no son un nodo con nombre.
 * `block` es el único que lleva un tipo de bloque en `id`; el resto dice qué cosa
 * se inserta y lo deja en manos de quien llama, porque elegir un fichero del
 * sistema no es cosa del editor.
 */
export type MenuActionKind =
  | "block"
  | "image"
  | "whiteboard"
  | "attachment"
  | "codeBlock"
  | "table"
  | "math"
  | "divider"
  | "taskList";

export interface MenuItem {
  /** Discriminante: qué hay que hacer al elegirla. */
  kind: MenuActionKind;
  /** Solo en las de tipo de bloque: a cuál de los siete se cambia. */
  id?: string;
  /** Rótulo en español. También es el nombre accesible: no hay botones solo con icono. */
  label: string;
  /** SVG crudo con `viewBox`, como lo espera `innerHTML`. */
  icon: string;
}

export interface MenuGroup {
  /** Nombre del grupo, tal y como se lee en el menú. */
  group: string;
  items: readonly MenuItem[];
}

/** Los iconos que no son un tipo de bloque, cada uno en un solo sitio. */
export const EDITOR_ICONS = {
  image: svg(
    `<rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 4.5-4 3 2.5 2.5-2 6 5.5" />`,
  ),
  attachment: svg(
    `<path d="M17.5 10.5 11 17a3.5 3.5 0 0 1-5-5l7-7a2.5 2.5 0 0 1 3.5 3.5l-6.5 6.5a1.5 1.5 0 0 1-2-2.2l5.5-5.5" />`,
  ),
  /** La pizarra no es un bloque de Markdown: es una imagen con un lienzo encima. */
  whiteboard: svg(
    `<path d="M4 5h16v12H4z" /><path d="m7 14 3-3 2 2 2-2 3 3" /><path d="M7 9h.01" />`,
  ),
  code: svg(`<path d="M8 9 4 12l4 3M16 9l4 3-4 3M14 5l-4 14" />`),
  table: svg(
    `<rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" />`,
  ),
  math: svg(
    `<path d="M5 5h14" /><path d="m5 19 6-14" /><path d="M9 15h9" /><path d="M17.5 5v14M14.5 12l6-7M14.5 12l6 7" />`,
  ),
  divider: svg(`<path d="M3 12h18" /><path d="M6 7h12M6 17h12" opacity=".45" />`),
  task: svg(`<rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" />`),
} as const;

// ---------------------------------------------------------------------------
// Los estilos de bloque de la barra de formato
// ---------------------------------------------------------------------------

/**
 * Los estilos que ofrece la barra de formato.
 *
 * Son los siete del menú del `+` **más** los títulos de 4 a 6 y el separador. Los
 * títulos de 4 a 6 no son un tipo de bloque del motor —`setBlockType` solo llega
 * hasta el tercero—: son un `heading` con otro `level`, y su botón es por fin el
 * sitio donde se eligen, en vez de escribiendo `/`. El separador tampoco es un
 * tipo: es un bloque que se inserta.
 */
export type StyleBlockId =
  | EditorBlockType
  | "heading4"
  | "heading5"
  | "heading6"
  | "divider";

export interface StyleBlockItem {
  id: StyleBlockId;
  label: string;
  /** SVG crudo: la barra lo pinta con `innerHTML`. */
  icon: string;
}

/**
 * La «H» con su número, para los títulos que antes no tenían dibujo.
 *
 * Los tres primeros títulos tienen un trazo cada uno —una letra con una raya— y
 * del cuarto al sexto no había ningún sitio donde dibujar. Se les da uno con el
 * criterio de los otros: la barra los enseña los seis juntos y tienen que
 * reconocerse el uno al otro de un vistazo.
 *
 * El número va como `<text>` porque dibujarlo con trazos al lado de una «H» de
 * tres líneas sale un garabato. Es SVG de toda la vida y lo pinta `innerHTML`
 * como los demás.
 */
function headingIcon(level: 4 | 5 | 6): string {
  return svg(
    `<path d="M4 6v12M10 6v12M4 12h6" /><text x="17.5" y="16.5" font-size="9" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">${level}</text>`,
  );
}

/** Un estilo tomado del catálogo de tipos: el rótulo y el dibujo no se duplican. */
function styleItem(id: EditorBlockType): StyleBlockItem {
  const found = EDITOR_BLOCKS.find((item) => item.id === id);
  if (!found) throw new Error(`La barra pide un tipo de bloque que no existe: ${id}`);
  return { id: found.id, label: found.label, icon: found.icon };
}

/**
 * Los estilos de la barra, en el orden en que se leen y se recorren con las flechas.
 *
 * Los seis títulos van juntos porque es como se leen: quien escribe una nota
 * elige el nivel del título de un vistazo, no por familias de «Texto» y «Más». Los
 * siete del menú del `+` salen del catálogo, así que su rótulo y su dibujo tienen
 * un solo sitio.
 */
export const STYLE_BLOCKS: readonly StyleBlockItem[] = [
  styleItem("paragraph"),
  styleItem("heading1"),
  styleItem("heading2"),
  styleItem("heading3"),
  { id: "heading4", label: "Título 4", icon: headingIcon(4) },
  { id: "heading5", label: "Título 5", icon: headingIcon(5) },
  { id: "heading6", label: "Título 6", icon: headingIcon(6) },
  styleItem("quote"),
  styleItem("bullet"),
  styleItem("ordered"),
  { id: "divider", label: "Separador", icon: EDITOR_ICONS.divider },
];

/**
 * El estilo que hay donde está el cursor, con el nivel **exacto** del título.
 *
 * `blockTypeAt` del motor agrupa los títulos de 4 a 6 con el tercero porque los
 * menús no tenían un botón para ellos. La barra sí los tiene, así que aquí el
 * nivel se lee del atributo: marcar «Título 3» en un `####` sería enseñarle a
 * quien escribe algo que no es lo que tiene delante.
 *
 * Con una lista, una cita o un texto suelto devuelve lo que dice el motor.
 */
export function styleIdAt($pos: BlockPosition): StyleBlockId {
  const tipo = blockTypeAt($pos);
  if (tipo !== "heading3") return tipo;
  return headingStyleId($pos) ?? tipo;
}

/** El `heading` que contiene esa posición, con su nivel del 1 al 6. */
function headingStyleId($pos: BlockPosition): StyleBlockId | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "heading") return headingStyle(node.attrs?.level);
  }
  const parent = $pos.parent;
  if (parent?.type.name === "heading") return headingStyle(parent.attrs?.level);
  return null;
}

/** Un nivel de título, sea el que sea, como un estilo de la barra. */
function headingStyle(level: unknown): StyleBlockId {
  const value = typeof level === "number" && Number.isFinite(level) ? Math.trunc(level) : 1;
  if (value <= 1) return "heading1";
  return `heading${Math.min(6, value)}` as StyleBlockId;
}

/**
 * Todos los estilos que toca la selección.
 *
 * Igual que `blockTypesInSelection` pero sin agrupar los títulos: con texto
 * seleccionado devuelve los de todos los bloques que la tocan, y si no coinciden
 * hay más de uno y **ningún** estilo puede marcarse —no se puede decir «estás en
 * un título» cuando hay un título y un párrafo debajo—.
 */
export function stylesInSelection(
  doc: BlockDocument,
  from: number,
  to: number,
): Set<StyleBlockId> {
  const estilos = new Set<StyleBlockId>();
  doc.nodesBetween(from, to, (node, pos) => {
    // `nodesBetween` pasa también por los contenedores, y solo el bloque de texto
    // dice qué hay escrito dentro: sin este filtro un elemento suelto de una
    // lista se contaría también como texto suelto.
    if (node?.isTextblock !== true) return undefined;
    // De `pos + 1`, y no de `pos`: lo que da la visita es la posición **antes** del
    // bloque, y desde ahí no se ve el bloque, sino lo que lo contiene. En un
    // `####` eso devolvía «Texto» en vez de «Título 4».
    estilos.add(styleIdAt(doc.resolve(pos + 1)));
    return undefined;
  });
  // Con el cursor suelto no hay nada que visitar: se pregunta por el bloque que lo
  // contiene, que es lo que cualquiera mira antes de escribir.
  if (!estilos.size && from === to) estilos.add(styleIdAt(doc.resolve(from)));
  return estilos;
}

/**
 * Completa un enlace con el protocolo que falta.
 *
 * Sin esto, escribir `ejemplo.com` guarda `[texto](ejemplo.com)`, y Markdown lee
 * eso como una ruta dentro de la nota en vez de como una dirección: el enlace
 * apuntaría a un fichero que no existe. Un esquema propio o un ancla se dejan
 * como están, que ahí sí se sabe lo que se está escribiendo.
 */
export function normalizeLinkHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("#")) return trimmed;
  return /^[a-z][\w+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Una entrada de bloque, tomada del catálogo: el icono no se duplica. */
function blockItem(id: EditorBlockType): MenuItem {
  const found = EDITOR_BLOCKS.find((item) => item.id === id);
  if (!found) throw new Error(`El menú pide un tipo de bloque que no existe: ${id}`);
  return { kind: "block", id: found.id, label: found.label, icon: found.icon };
}

/**
 * El menú del `+`: todo lo que se puede poner en la nota.
 *
 * No es solo de tipos de texto: es Markdown entero —títulos, listas, citas— y
 * las tres cosas que son de la app y no de Markdown: imagen, pizarra y archivo
 * adjunto. Está como datos y no en el componente para que se pueda probar en
 * Node, y para que el componente solo tenga que pintar y elegir a quién llamar.
 */
export const INSERT_MENU: readonly MenuGroup[] = [
  {
    group: "Texto",
    items: [
      blockItem("paragraph"),
      blockItem("heading1"),
      blockItem("heading2"),
      blockItem("heading3"),
    ],
  },
  {
    // «Listas y citas», y no «Listas y texto»: el rótulo del grupo tiene que decir
    // qué hay dentro, porque ahora mismo el grupo lleva una cita y dos listas.
    group: "Listas y citas",
    items: [blockItem("bullet"), blockItem("ordered"), blockItem("quote")],
  },
  {
    group: "Insertar",
    items: [
      { kind: "image", label: "Imagen", icon: EDITOR_ICONS.image },
      { kind: "whiteboard", label: "Pizarra", icon: EDITOR_ICONS.whiteboard },
      { kind: "attachment", label: "Adjuntar archivo", icon: EDITOR_ICONS.attachment },
    ],
  },
];

/** Una entrada de menú tomada de los estilos de la barra: ni rótulo ni dibujo duplicados. */
function styleMenuItem(id: StyleBlockId): MenuItem {
  const found = STYLE_BLOCKS.find((item) => item.id === id);
  if (!found) throw new Error(`El menú pide un estilo que no existe: ${id}`);
  return { kind: "block", id: found.id, label: found.label, icon: found.icon };
}

/**
 * El menú `/`: los mismos estilos que la barra, y lo que solo cabe en un bloque.
 *
 * Los seis títulos salen de `STYLE_BLOCKS`, que es el catálogo de la barra: un
 * rótulo o un dibujo repetido es un rótulo que se queda viejo en uno de los dos
 * sitios sin que nadie se entere.
 *
 * Ojo con los títulos del 4 al 6: **no** son `EditorBlockType`, así que no valen
 * para `setBlockType`. Son un `heading` de Tiptap con otro `level`, que se pone
 * con su propio comando del editor.
 */
export const SLASH_MENU: readonly MenuGroup[] = [
  {
    group: "Texto",
    items: [
      styleMenuItem("paragraph"),
      styleMenuItem("heading1"),
      styleMenuItem("heading2"),
      styleMenuItem("heading3"),
      styleMenuItem("heading4"),
      styleMenuItem("heading5"),
      styleMenuItem("heading6"),
      styleMenuItem("quote"),
      { kind: "divider", label: "Separador", icon: EDITOR_ICONS.divider },
    ],
  },
  {
    group: "Listas",
    items: [
      blockItem("bullet"),
      blockItem("ordered"),
      { kind: "taskList", label: "Tareas", icon: EDITOR_ICONS.task },
    ],
  },
  {
    group: "Insertar",
    items: [
      { kind: "image", label: "Imagen", icon: EDITOR_ICONS.image },
      { kind: "codeBlock", label: "Código", icon: EDITOR_ICONS.code },
      { kind: "table", label: "Tabla", icon: EDITOR_ICONS.table },
      { kind: "math", label: "Fórmula", icon: EDITOR_ICONS.math },
      { kind: "whiteboard", label: "Pizarra", icon: EDITOR_ICONS.whiteboard },
    ],
  },
];

/**
 * Los nombres de los botones del editor, en español.
 *
 * Los botones de formato solo llevan una letra o un SVG dentro, así que sin nombre
 * un lector de pantalla lee «botón» a secas. Y en una nota en español leer *Bold* a
 * media frase es un descuido. El rótulo visible no es de este grupo porque aquí no
 * hay texto: lo que se ve es el nombre accesible y el `title`.
 */
export const EDITOR_BUTTON_LABELS = {
  bold: "Negrita",
  italic: "Cursiva",
  underline: "Subrayado",
  strikethrough: "Tachado",
  code: "Código en línea",
  math: "Fórmula",
  link: "Enlace",
  linkUrl: "Dirección del enlace",
  textColor: "Color de texto",
  textBackground: "Fondo del texto",
  /** La barra fija, y el selector de estilo que abre su lista. */
  bar: "Formato de la nota",
  style: "Estilo de bloque",
  styleMenu: "Estilos de bloque",
  /** La barrita que aparece dentro de una tabla. */
  table: "Controles de la tabla",
  /** Los cuatro lados de los que se pega el texto de un párrafo. */
  alignLeft: "Alinear a la izquierda",
  alignCenter: "Centrar el texto",
  alignRight: "Alinear a la derecha",
  alignJustify: "Justificar el texto",
  /** El rótulo de la barrita de alineación, para quien la recorre con el teclado. */
  alignBar: "Alineación del párrafo",
} as const;

/**
 * Los cuatro botones de alinear el texto de un párrafo.
 *
 * Se separan del resto de las marcas porque no son marcas: alinear es del **bloque**,
 * y por eso el botón se enciende con lo que tiene el párrafo y no con lo que tiene el
 * texto. El valor va delante en vez de esconderse en un `switch`, que es lo mismo que
 * hace la barrita de la tabla con sus tres botones: el mismo comando con otro valor.
 *
 * Los iconos son de Material Symbols y están dibujados con `text-align` de verdad —
 * unas rayas de distinta longitud— porque con un icono genérico no se sabe de qué
 * botón se trata sin leer el `title`.
 */
export const EDITOR_ALIGNMENTS = [
  {
    value: "left",
    label: EDITOR_BUTTON_LABELS.alignLeft,
    icon: svg(`<path d="M4 6h16M4 10h10M4 14h16M4 18h10" />`),
  },
  {
    value: "center",
    label: EDITOR_BUTTON_LABELS.alignCenter,
    icon: svg(`<path d="M4 6h16M7 10h10M4 14h16M7 18h10" />`),
  },
  {
    value: "right",
    label: EDITOR_BUTTON_LABELS.alignRight,
    icon: svg(`<path d="M4 6h16M10 10h10M4 14h16M10 18h10" />`),
  },
  {
    value: "justify",
    label: EDITOR_BUTTON_LABELS.alignJustify,
    icon: svg(`<path d="M4 6h16M4 10h16M4 14h16M4 18h16" />`),
  },
] as const;

// ---------------------------------------------------------------------------
// Los controles de tabla
// ---------------------------------------------------------------------------

/**
 * Los botones que alinean el texto de una celda.
 *
 * Se separan del resto porque no son un comando distinto —los tres son
 * `setCellAttribute`— sino el mismo con otro valor, y por eso llevan el valor
 * delante en vez de esconderlo en un `switch`.
 */
export type TableAlignKind = "alignLeft" | "alignCenter" | "alignRight";

/** El `text-align` que acepta la celda. */
export type TableAlign = "left" | "center" | "right";

/** Todos los botones de la barrita de una tabla. */
export type TableActionKind =
  | "rowAbove"
  | "rowBelow"
  | "columnLeft"
  | "columnRight"
  | "deleteRow"
  | "deleteColumn"
  | "deleteTable"
  | "headerRow"
  | TableAlignKind;

interface TableActionBase {
  label: string;
  icon: string;
}

/** Un botón que alinea: lleva el valor que pone en la celda. */
export interface TableAlignAction extends TableActionBase {
  kind: TableAlignKind;
  align: TableAlign;
}

/** Un botón que no alinea: no lleva valor, y por eso `align` no existe. */
export interface TableEditAction extends TableActionBase {
  kind: Exclude<TableActionKind, TableAlignKind>;
  align?: undefined;
}

/** Los botones son datos puros: el componente decide a qué comando llama cada uno. */
export type TableActionItem = TableAlignAction | TableEditAction;

export interface TableActionGroup {
  /** Nombre del grupo, tal y como se lee en la barrita. */
  group: string;
  items: readonly TableActionItem[];
}

/**
 * Los botones de la tabla, en el orden en que se recorren con las flechas.
 *
 * Filas y columnas primero —son lo que hace falta para **tener** una tabla—,
 * después lo que la deshace, y al final el encabezado y la alineación, que son
 * adornos. Los grupos son para leerlos, no para ocultarlos: la barrita es de once
 * botones y todos caben.
 */
export const TABLE_ACTION_GROUPS: readonly TableActionGroup[] = [
  {
    group: "Añadir filas y columnas",
    items: [
      {
        kind: "rowAbove",
        label: "Añadir fila encima",
        icon: svg(`<path d="M4 6h16" opacity=".45" /><path d="M4 11h16" opacity=".45" /><path d="M12 13v8M12 21l-2.5-2.5M12 21l2.5-2.5" />`),
      },
      {
        kind: "rowBelow",
        label: "Añadir fila debajo",
        icon: svg(`<path d="M4 6h16" opacity=".45" /><path d="M4 11h16" opacity=".45" /><path d="M12 13v8M9.5 18.5 12 21l2.5-2.5" />`),
      },
      {
        kind: "columnLeft",
        label: "Añadir columna a la izquierda",
        icon: svg(`<path d="M6 4v16" opacity=".45" /><path d="M11 4v16" opacity=".45" /><path d="M13 12h8M21 12l-2.5-2.5M21 12l-2.5 2.5" />`),
      },
      {
        kind: "columnRight",
        label: "Añadir columna a la derecha",
        icon: svg(`<path d="M6 4v16" opacity=".45" /><path d="M11 4v16" opacity=".45" /><path d="M13 12h8M18.5 9.5 21 12l-2.5 2.5" />`),
      },
    ],
  },
  {
    group: "Eliminar",
    items: [
      {
        kind: "deleteRow",
        label: "Eliminar fila",
        icon: svg(`<path d="M4 6h16" opacity=".45" /><path d="M4 11h16" opacity=".45" /><path d="M9 17h6" />`),
      },
      {
        kind: "deleteColumn",
        label: "Eliminar columna",
        icon: svg(`<path d="M6 4v16" opacity=".45" /><path d="M11 4v16" opacity=".45" /><path d="M9 17v6M9 17h6" />`),
      },
      {
        kind: "deleteTable",
        label: "Eliminar tabla",
        icon: svg(`<path d="M4 7h16" /><path d="M9.5 7V4.5h5V7" /><path d="M6.5 7l1 12.5h9L17.5 7" />`),
      },
    ],
  },
  {
    group: "Cabecera",
    items: [
      {
        kind: "headerRow",
        label: "Alternar fila de cabecera",
        icon: svg(`<path d="M4 5.5h16" stroke-width="2.4" /><path d="M4 11.5h16" opacity=".45" /><path d="M4 17.5h16" opacity=".45" />`),
      },
    ],
  },
  {
    group: "Alinear el texto de la celda",
    items: [
      {
        kind: "alignLeft",
        label: "Alinear a la izquierda",
        align: "left",
        icon: svg(`<path d="M4 6h16" /><path d="M4 11.5h9" /><path d="M4 17h13" /><path d="M4 22h7" />`),
      },
      {
        kind: "alignCenter",
        label: "Centrar",
        align: "center",
        icon: svg(`<path d="M4 6h16" /><path d="M7.5 11.5h9" /><path d="M6 17h12" /><path d="M9 22h6" />`),
      },
      {
        kind: "alignRight",
        label: "Alinear a la derecha",
        align: "right",
        icon: svg(`<path d="M4 6h16" /><path d="M11 11.5h9" /><path d="M7 17h13" /><path d="M13 22h7" />`),
      },
    ],
  },
];

/** Los dos colores de la barra flotante, que no son un tipo de bloque. */
export const EDITOR_COLOR_ICONS = {
  textColor: svg(
    `<path d="m14.6 17.9-1.3-1.3a1 1 0 0 1 0-1.4l1.4-1.4a1 1 0 0 1 1.4 0l1.3 1.3a1 1 0 0 1 0 1.4l-1.4 1.4a1 1 0 0 1-1.4 0Z" /><path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM15 5l4 4" />`,
  ),
  textBackground: svg(
    `<path d="m4 16 8-8 4 4-8 8H4v-4Z" /><path d="m12 8 4-4 4 4-4 4M4 20h16" />`,
  ),
} as const;