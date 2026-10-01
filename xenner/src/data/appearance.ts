import type { Appearance, FontOption } from "../types/appearance";

/**
 * Tipografías disponibles, agrupadas por sensación para que 39 opciones no
 * sean una lista plana imposible de escanear.
 *
 * Importante: son pilas de CSS, no webfonts. Xenner funciona sin conexión y sin
 * peticiones remotas, así que cada valor nombra la familia y de qué se sustituye
 * si no está instalada. Una familia que no exista en el equipo cae en la
 * siguiente de la pila.
 */
export const FONT_GROUPS = [
  { id: "sans", label: "Sans (la de siempre)" },
  { id: "serif", label: "Serif (de libro)" },
  { id: "mono", label: "Monoespaciada (código)" },
  { id: "display", label: "Caracteres especiales" },
] as const;

export type FontGroupId = (typeof FONT_GROUPS)[number]["id"];

export const FONT_OPTIONS: readonly FontOption[] = [
  // Sans
  { id: "system", group: "sans", label: "Sistema", value: "system-ui, sans-serif" },
  { id: "segoe", group: "sans", label: "Segoe UI", value: '"Segoe UI", system-ui, sans-serif' },
  { id: "calibri", group: "sans", label: "Calibri", value: "Calibri, system-ui, sans-serif" },
  { id: "helvetica", group: "sans", label: "Helvetica", value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: "arial", group: "sans", label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { id: "verdana", group: "sans", label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { id: "tahoma", group: "sans", label: "Tahoma", value: "Tahoma, Verdana, sans-serif" },
  { id: "trebuchet", group: "sans", label: "Trebuchet MS", value: '"Trebuchet MS", Tahoma, sans-serif' },
  { id: "candara", group: "sans", label: "Candara", value: 'Candara, Calibri, "Segoe UI", sans-serif' },
  { id: "gill", group: "sans", label: "Gill Sans", value: '"Gill Sans", "Trebuchet MS", sans-serif' },
  { id: "futura", group: "sans", label: "Futura", value: 'Futura, "Century Gothic", sans-serif' },
  { id: "optima", group: "sans", label: "Optima", value: 'Optima, Candara, "Segoe UI", sans-serif' },
  { id: "roboto", group: "sans", label: "Roboto / Noto Sans", value: 'Roboto, "Noto Sans", system-ui, sans-serif' },
  { id: "inter", group: "sans", label: "Inter", value: 'Inter, "Noto Sans", system-ui, sans-serif' },
  { id: "lato", group: "sans", label: "Lato", value: 'Lato, "Segoe UI", system-ui, sans-serif' },

  // Serif
  { id: "serif", group: "serif", label: "Georgia", value: 'Georgia, "Noto Serif", serif' },
  { id: "times", group: "serif", label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { id: "palatino", group: "serif", label: "Palatino", value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { id: "garamond", group: "serif", label: "Garamond", value: 'Garamond, "EB Garamond", Georgia, serif' },
  { id: "bookman", group: "serif", label: "Bookman", value: '"Bookman Old Style", Georgia, serif' },
  { id: "iowan", group: "serif", label: "Iowan Old Style", value: '"Iowan Old Style", "Palatino Linotype", serif' },
  { id: "didot", group: "serif", label: "Didot", value: 'Didot, "Bodoni MT", Georgia, serif' },
  { id: "charter", group: "serif", label: "Charter", value: 'Charter, "Bitstream Charter", Georgia, serif' },

  // Monoespaciada
  { id: "mono", group: "mono", label: "Monoespaciada", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  { id: "courier", group: "mono", label: "Courier New", value: '"Courier New", Courier, monospace' },
  { id: "consolas", group: "mono", label: "Consolas", value: 'Consolas, "Liberation Mono", monospace' },
  { id: "menlo", group: "mono", label: "Menlo", value: 'Menlo, "DejaVu Sans Mono", monospace' },
  { id: "sfmono", group: "mono", label: "SF Mono", value: '"SF Mono", ui-monospace, Menlo, monospace' },
  { id: "andale", group: "mono", label: "Andale Mono", value: '"Andale Mono", "Lucida Console", monospace' },
  { id: "lucida", group: "mono", label: "Lucida Console", value: '"Lucida Console", Monaco, monospace' },
  { id: "nimbus", group: "mono", label: "Nimbus Mono", value: '"Nimbus Mono PS", "Courier New", monospace' },

  // Caracteres especiales
  { id: "rounded", group: "display", label: "Redondeada", value: 'ui-rounded, "SF Pro Rounded", "Segoe UI", sans-serif' },
  { id: "papyrus", group: "display", label: "Papiro", value: 'Papyrus, "Bradley Hand", fantasy' },
  { id: "comic", group: "display", label: "Comic", value: '"Comic Sans MS", "Chalkboard SE", cursive' },
  { id: "script", group: "display", label: "Manuscrita", value: '"Brush Script MT", "Segoe Script", cursive' },
  { id: "impact", group: "display", label: "Impact", value: "Impact, Haettenschweiler, sans-serif" },
  { id: "typewriter", group: "display", label: "Máquina de escribir", value: '"American Typewriter", "Courier New", serif' },
  { id: "charcoal", group: "display", label: "Carbón", value: 'Charcoal, "Trebuchet MS", sans-serif' },
  { id: "copperplate", group: "display", label: "Cobre", value: 'Copperplate, "Copperplate Gothic Light", fantasy' },
];

/**
 * Valores con los que arranca Xenner. Vive en `data/` porque es información
 * estática: la usa el servicio para sanear lo guardado y el modal para saber
 * cuándo algo se ha apartado de lo normal y ofrecer "Restablecer".
 */
export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system",
  uiFont: FONT_OPTIONS[0].value,
  editorFont: FONT_OPTIONS[0].value,
  editorSize: 16,
  lineHeight: 1.7,
  contentWidth: 860,
};

/** ¿Alguna preferencia se ha cambiado respecto a lo que trae Xenner? */
export function isDefaultAppearance(appearance: Appearance): boolean {
  return (
    appearance.mode === DEFAULT_APPEARANCE.mode &&
    appearance.uiFont === DEFAULT_APPEARANCE.uiFont &&
    appearance.editorFont === DEFAULT_APPEARANCE.editorFont &&
    appearance.editorSize === DEFAULT_APPEARANCE.editorSize &&
    appearance.lineHeight === DEFAULT_APPEARANCE.lineHeight &&
    appearance.contentWidth === DEFAULT_APPEARANCE.contentWidth
  );
}
