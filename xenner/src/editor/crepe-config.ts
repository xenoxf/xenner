import { EDITOR_BLOCKS } from "../data/editor.ts";

/**
 * La configuración de Crepe, como datos.
 *
 * Antes vivía dentro de `MarkdownEditor.tsx`, en el `new Crepe({...})`. Eso
 * convertía un archivo de 900 líneas en el sitio donde se mezclaban tres cosas
 * que no tienen relación: lo que el editor es (qué features van encendidas), lo
 * que se le dice a la persona (etiquetas, nombres accesibles) y lo que hace
 * (comandos, inserciones). Convivir en un solo sitio es lo que hizo que un
 * arreglo del `+` acabara tocando la configuración del menú de enlaces.
 *
 * Aquí solo hay **datos**: cadenas y funciones sin estado. Lo que decide qué
 * pasa cuando alguien pulsa un botón vive en `editor-commands.ts`, y lo que
 * necesita ProseMirror, en el propio componente.
 */

const svg = (paths: string, width = 1.8): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

/** El icono de la pizarra en el menú de tipos. No es un bloque Markdown. */
export const WHITEBOARD_ICON = svg(
  `<path d="M4 5h16v12H4z" /><path d="m7 14 3-3 2 2 2-2 3 3" /><path d="M7 9h.01" />`,
);

export const TEXT_COLOR_ICON = svg(
  `<path d="m14.6 17.9-1.3-1.3a1 1 0 0 1 0-1.4l1.4-1.4a1 1 0 0 1 1.4 0l1.3 1.3a1 1 0 0 1 0 1.4l-1.4 1.4a1 1 0 0 1-1.4 0Z" /><path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM15 5l4 4" />`,
);

export const TEXT_BACKGROUND_ICON = svg(
  `<path d="m4 16 8-8 4 4-8 8H4v-4Z" /><path d="m12 8 4-4 4 4-4 4M4 20h16" />`,
);

/**
 * Las claves de `Crepe.Feature` en texto.
 *
 * Se escriben a mano para que este módulo no importe Crepe y se pueda probar en
 * Node. Los valores son los del enum de Crepe, y `crepe-config.test.ts` los
 * compara contra el enum de verdad: si Crepe los renombra, ese test falla en vez
 * de que una feature deje de encenderse en silencio.
 */
export const CREPE_FEATURE_KEYS = {
  AI: "ai",
  TopBar: "top-bar",
  BlockEdit: "block-edit",
  ImageBlock: "image-block",
  Toolbar: "toolbar",
  Placeholder: "placeholder",
  LinkTooltip: "link-tooltip",
  CodeMirror: "code-mirror",
} as const;

/** Qué features se encienden, y las que se apagan a propósito. */
export const CREPE_FEATURES = {
  /** Escribir con IA no es el objetivo de un editor de notas local. */
  [CREPE_FEATURE_KEYS.AI]: false,
  /** La barra superior fija se solapa con la flotante y con el dock. */
  [CREPE_FEATURE_KEYS.TopBar]: false,
  /** El asa lateral: el tirador de arrastrar y el sitio donde va nuestro `+`. */
  [CREPE_FEATURE_KEYS.BlockEdit]: true,
  [CREPE_FEATURE_KEYS.ImageBlock]: true,
} as const;

/** Los grupos del menú `/`, con las etiquetas que ve la persona. */
export const SLASH_GROUPS = {
  text: {
    label: "Texto",
    text: { label: "Texto" },
    h1: { label: "Título 1" },
    h2: { label: "Título 2" },
    h3: { label: "Título 3" },
    h4: { label: "Título 4" },
    h5: { label: "Título 5" },
    h6: { label: "Título 6" },
    quote: { label: "Cita" },
    divider: { label: "Separador" },
  },
  list: {
    label: "Listas",
    bulletList: { label: "Viñetas" },
    orderedList: { label: "Numerada" },
    taskList: { label: "Tareas" },
  },
  advanced: {
    label: "Insertar",
    image: { label: "Imagen" },
    codeBlock: { label: "Código" },
    table: { label: "Tabla" },
    math: { label: "Fórmula" },
  },
} as const;

/**
 * Los nombres accesibles de los botones que pone Crepe.
 *
 * Sus botones solo llevan un SVG dentro, así que sin nombre un lector de
 * pantalla lee «botón» a secas. Y en una nota en español, leer *Bold* a media
 * frase es un descuido.
 */
export const CREPE_BUTTON_LABELS = {
  bold: "Negrita",
  italic: "Cursiva",
  strikethrough: "Tachado",
  code: "Código en línea",
  latex: "Fórmula",
  link: "Enlace",
} as const;

/** Los textos de las piezas que no son la barra flotante, también en inglés. */
export const CREPE_TEXT_LABELS = {
  image: {
    blockUploadButton: "Subir archivo",
    blockConfirmButton: "Confirmar",
    blockUploadPlaceholderText: "o pega un enlace",
    blockCaptionPlaceholderText: "Escribe el pie de la imagen",
    inlineUploadButton: "Subir",
    inlineUploadPlaceholderText: "o pega un enlace",
  },
  link: {
    // Solo el marcador de posición es texto: `editButton`, `removeButton` y
    // `confirmButton` reciben SVG. El `title` del tooltip de un enlace ya
    // escrito está dentro del paquete y no hay campo para cambiarlo.
    inputPlaceholder: "Pega el enlace…",
  },
  codeMirror: {
    searchPlaceholder: "Buscar lenguaje",
    noResultText: "Sin resultados",
  },
  placeholder: {
    text: "Escribe tu nota…",
    mode: "doc" as const,
  },
} as const;

/** Los iconos de los tipos de bloque, en el orden en que salen en el menú. */
export const BLOCK_TYPE_ICONS = EDITOR_BLOCKS.map((item) => ({
  id: item.id,
  label: item.label,
  icon: item.icon,
}));

export const IMAGE_ICON = svg(
  `<rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 4.5-4 3 2.5 2.5-2 6 5.5" />`,
);

export const ATTACHMENT_ICON = svg(
  `<path d="M17.5 10.5 11 17a3.5 3.5 0 0 1-5-5l7-7a2.5 2.5 0 0 1 3.5 3.5l-6.5 6.5a1.5 1.5 0 0 1-2-2.2l5.5-5.5" />`,
);

/** Lo que hace una entrada del menú del `+`. */
export type InsertAction =
  /** Cambia el tipo del bloque del cursor. */
  | { kind: "block"; id: string; label: string; icon: string }
  /** Abre el explorador de archivos del sistema. */
  | { kind: "image"; label: string; icon: string }
  | { kind: "attachment"; label: string; icon: string }
  /** Inserta una pizarra en blanco. */
  | { kind: "whiteboard"; label: string; icon: string };

export interface InsertGroup {
  group: string;
  items: InsertAction[];
}

/** Una entrada de bloque, tomada del catálogo de tipos. */
const blockAction = (id: string): InsertAction => {
  const found = BLOCK_TYPE_ICONS.find((item) => item.id === id);
  if (!found) throw new Error(`El menú pide un tipo que no existe: ${id}`);
  return { kind: "block", id: found.id, label: found.label, icon: found.icon };
};

/**
 * Todo lo que se puede poner en la nota, en el orden en que se lee.
 *
 * El menú del `+` no es solo de tipos de texto: es **todo**. Markdown entero —
  títulos, listas, citas— y las tres cosas que son de la app y no de Markdown:
  imagen, pizarra y archivo adjunto.
 *
 * La lista está aquí, y no en el componente, porque es contenido y porque así se
 * puede probar en Node. El componente solo la pinta y decide a qué función llama
 * cada cosa.
 */
export const INSERT_MENU: readonly InsertGroup[] = [
  {
    group: "Texto",
    items: [
      blockAction("paragraph"),
      blockAction("heading1"),
      blockAction("heading2"),
      blockAction("heading3"),
    ],
  },
  {
    group: "Listas y texto",
    items: [blockAction("bullet"), blockAction("ordered"), blockAction("quote")],
  },
  {
    group: "Insertar",
    items: [
      { kind: "image", label: "Imagen", icon: IMAGE_ICON },
      { kind: "whiteboard", label: "Pizarra", icon: WHITEBOARD_ICON },
      { kind: "attachment", label: "Adjuntar archivo", icon: ATTACHMENT_ICON },
    ],
  },
];