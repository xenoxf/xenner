/**
 * Las combinaciones de teclado de la app, como **datos**.
 *
 * Aquí vive el catálogo de acciones, sus combinaciones por defecto y las
 * utilidades para leer, comparar y enseñar una combinación escrita como
 * `Mod-Alt-1`. No toca el DOM ni el almacenamiento: la persistencia vive en
 * `services/shortcuts.ts` y quien la use —el editor, el controlador de la
 * app, la sección de Ajustes— la importa de un sitio u otro según lo que
 * necesite saber.
 *
 * El formato `Mod-Alt-1` es el mismo que entiende `prosemirror-keymap`:
 * `Mod` es Ctrl en Windows y Linux, ⌘ en macOS; `Alt` e `Inter` lo mismo en
 * todos los sitios. La «tecla principal» no se escribe `Ctrl-b` y `⌘-b` por
 * separado: se escribe `Mod-b` y la plataforma decide, que es lo que hacen las
 * extensiones del editor desde el primer día.
 */
import { isMacPlatform } from "../services/platform.ts";

export type ShortcutGroupId = "nota" | "aplicacion" | "insertar" | "bloque";

export interface ShortcutGroup {
  id: ShortcutGroupId;
  label: string;
  hint: string;
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  { id: "nota", label: "La nota", hint: "Guardar y actualizar lo que hay abierto" },
  { id: "aplicacion", label: "La aplicación", hint: "Buscar, los paneles y la lista" },
  { id: "insertar", label: "Insertar", hint: "Poner cosas dentro de la nota" },
  { id: "bloque", label: "Blockes y estilos", hint: "Cambiar qué es cada trozo de texto" },
];

export type ShortcutActionId =
  | "nota.save"
  | "nota.reload"
  | "app.refresh"
  | "app.palette"
  | "app.paletteCommands"
  | "app.sidebar"
  | "insert.menu"
  | "insert.image"
  | "insert.attachment"
  | "insert.whiteboard"
  | "insert.codeBlock"
  | "insert.table"
  | "insert.math"
  | "insert.divider"
  | "bloque.paragraph"
  | "bloque.heading1"
  | "bloque.heading2"
  | "bloque.heading3"
  | "bloque.heading4"
  | "bloque.heading5"
  | "bloque.heading6"
  | "bloque.bullet"
  | "bloque.ordered"
  | "bloque.taskList"
  | "bloque.quote"
  | "bloque.codeInline";

export interface ShortcutAction {
  id: ShortcutActionId;
  label: string;
  group: ShortcutGroupId;
  /** La combinación, tal y como la entiende este módulo y `prosemirror-keymap`. */
  defaultCombo: string;
}

/**
 * La lista de la casa: todo lo que se puede hacer con el teclado.
 *
 * Sin combinaciones repetidas por defecto —se comprueba en los tests— y sin
 * pisar las que ya son de otros (ver `TECLAS_DE_OTROS` en `editor/keyboard.ts`).
 * Todas llevan un modificador o una tecla de función: una letra suelta se come
 * cada «a» que se escribe.
 */
export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  { id: "nota.save", label: "Guardar ahora", group: "nota", defaultCombo: "Mod-s" },
  { id: "nota.reload", label: "Recargar la nota del disco", group: "nota", defaultCombo: "Mod-Shift-r" },
  { id: "app.refresh", label: "Actualizar la lista de notas", group: "aplicacion", defaultCombo: "Mod-r" },
  { id: "app.palette", label: "Buscar una nota", group: "aplicacion", defaultCombo: "Mod-k" },
  { id: "app.paletteCommands", label: "Paleta de comandos", group: "aplicacion", defaultCombo: "Mod-Shift-p" },
  { id: "app.sidebar", label: "Mostrar u ocultar la lista de notas", group: "aplicacion", defaultCombo: "Mod-e" },
  { id: "insert.menu", label: "Ir a la línea siguiente y elegir el tipo de bloque", group: "insertar", defaultCombo: "Mod-/" },
  { id: "insert.image", label: "Imagen", group: "insertar", defaultCombo: "Mod-Alt-i" },
  { id: "insert.attachment", label: "Adjuntar archivo", group: "insertar", defaultCombo: "Mod-Alt-a" },
  { id: "insert.whiteboard", label: "Pizarra", group: "insertar", defaultCombo: "Mod-Alt-p" },
  { id: "insert.codeBlock", label: "Bloque de código", group: "insertar", defaultCombo: "Mod-Alt-k" },
  { id: "insert.table", label: "Tabla", group: "insertar", defaultCombo: "Mod-Alt-t" },
  { id: "insert.math", label: "Fórmula", group: "insertar", defaultCombo: "Mod-Alt-m" },
  { id: "insert.divider", label: "Separador", group: "insertar", defaultCombo: "Mod-Alt--" },
  { id: "bloque.paragraph", label: "Párrafo normal", group: "bloque", defaultCombo: "Mod-Alt-0" },
  { id: "bloque.heading1", label: "Título 1", group: "bloque", defaultCombo: "Mod-Alt-1" },
  { id: "bloque.heading2", label: "Título 2", group: "bloque", defaultCombo: "Mod-Alt-2" },
  { id: "bloque.heading3", label: "Título 3", group: "bloque", defaultCombo: "Mod-Alt-3" },
  { id: "bloque.heading4", label: "Título 4", group: "bloque", defaultCombo: "Mod-Alt-4" },
  { id: "bloque.heading5", label: "Título 5", group: "bloque", defaultCombo: "Mod-Alt-5" },
  { id: "bloque.heading6", label: "Título 6", group: "bloque", defaultCombo: "Mod-Alt-6" },
  { id: "bloque.bullet", label: "Lista con viñetas", group: "bloque", defaultCombo: "Mod-Shift-7" },
  { id: "bloque.ordered", label: "Lista numerada", group: "bloque", defaultCombo: "Mod-Shift-8" },
  { id: "bloque.taskList", label: "Lista de tareas", group: "bloque", defaultCombo: "Mod-Shift-9" },
  { id: "bloque.quote", label: "Cita", group: "bloque", defaultCombo: "Mod-Shift-." },
  { id: "bloque.codeInline", label: "Código en línea", group: "bloque", defaultCombo: "Mod-Alt-c" },
];

export type ShortcutMap = Record<ShortcutActionId, string>;
export type ShortcutOverrides = Partial<Record<ShortcutActionId, string>>;

export function defaultShortcutMap(): ShortcutMap {
  return Object.fromEntries(SHORTCUT_ACTIONS.map((accion) => [accion.id, accion.defaultCombo])) as ShortcutMap;
}

const MODIFICADORES = new Set(["Mod", "Ctrl", "Alt", "Shift"]);
const MOD_POR_MINUSCULA: Record<string, string> = {
  mod: "Mod",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};
const TECLAS_CON_NOMBRE = new Set([
  "Space", "Enter", "Escape", "Tab", "Backspace", "Delete", "Insert",
  "Home", "End", "PageUp", "PageDown",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
]);

export interface ParsedCombo {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** La tecla en su forma canónica: minúscula para las letras, nombre tal cual para las demás. */
  key: string;
}

/** La tecla de un evento como token canónico, o `null` si no se puede nombrar. */
export function normalizeKeyToken(key: string): string | null {
  if (typeof key !== "string" || key.length === 0) return null;
  if (key === " ") return "Space";
  if (key.length === 1) {
    // Solo se acepta lo que hay en un teclado: una letra, un dígito o un signo.
    if (!/[\x21-\x7E¡-ÿ]/.test(key)) return null;
    return key.toLowerCase();
  }
  // Las teclas que reporta un teclado de hoy: Enter, Escape, flechas, F1…F12.
  if (TECLAS_CON_NOMBRE.has(key)) return key;
  return null;
}

/**
 * Descompone `Mod-Alt-1` en sus partes, o `null` si no es una combinación.
 *
 * La tecla puede ser un guion (`-`), así que `Mod-Alt--` son Mod+Alt+«-» y no
 * otra cosa: cuando el texto acaba en dos guiones, el último es la tecla.
 */
export function parseCombo(combo: string): ParsedCombo | null {
  if (typeof combo !== "string" || !combo.trim()) return null;
  let key: string;
  let resto: string;
  if (combo.endsWith("--")) {
    key = "-";
    resto = combo.slice(0, -2);
  } else {
    const i = combo.lastIndexOf("-");
    if (i < 0) {
      // Sin ningún guion: una tecla de función puede valer por sí sola.
      key = combo;
      resto = "";
    } else {
      key = combo.slice(i + 1);
      resto = combo.slice(0, i);
    }
  }
  const canonica = normalizeKeyToken(key);
  if (canonica === null) return null;
  const partes = resto
    .split("-")
    .filter((p) => p.length > 0)
    .map((parte) => MOD_POR_MINUSCULA[parte.toLowerCase()] ?? parte);
  if (partes.some((parte) => !MODIFICADORES.has(parte))) return null;
  if (new Set(partes).size !== partes.length) return null;
  // El orden canónico: Mod, Ctrl, Alt, Shift. Leer da igual, escribir usamos éste.
  const orden = ["Mod", "Ctrl", "Alt", "Shift"];
  const leidos = orden.filter((m) => partes.includes(m));
  // Fuera de Mac, `Ctrl` y `Mod` son la misma tecla física: no hay «el atajo del
  // sistema» y «el atajo de Ctrl» por separado. Se pliegan en `Mod`, igual que
  // hace `sanitizeOverrides` al guardar, para que el mapa y los eventos hablen
  // el mismo idioma.
  const mods = isMacPlatform() ? leidos : [...new Set(leidos.map((m) => (m === "Ctrl" ? "Mod" : m)))];
  return {
    mod: mods.includes("Mod"),
    ctrl: mods.includes("Ctrl"),
    alt: mods.includes("Alt"),
    shift: mods.includes("Shift"),
    key: canonica,
  };
}

/** La combinación con los modificadores en su orden canónico. */
export function normalizeCombo(combo: string): string | null {
  const parsed = parseCombo(combo);
  if (!parsed) return null;
  const partes = [
    parsed.mod ? "Mod" : null,
    parsed.ctrl ? "Ctrl" : null,
    parsed.alt ? "Alt" : null,
    parsed.shift ? "Shift" : null,
    parsed.key,
  ].filter((p): p is string => p !== null);
  return partes.join("-");
}

/** ¿Se puede asignar sin romper el escribir? Letras con Shift solo no valen. */
export function isSafeCombo(combo: string): boolean {
  const parsed = parseCombo(combo);
  if (!parsed) return false;
  if (/^F([1-9]|1[0-2])$/.test(parsed.key)) return true;
  const mods = [parsed.mod, parsed.ctrl, parsed.alt, parsed.shift].filter(Boolean).length;
  if (mods === 0) return false;
  if (mods === 1 && parsed.shift && parsed.key.length === 1 && parsed.key !== "-") return false;
  return true;
}

const CODIGO_A_TECLA: Record<number, string> = {
  48: "0", 49: "1", 50: "2", 51: "3", 52: "4", 53: "5", 54: "6", 55: "7", 56: "8", 57: "9",
  65: "a", 66: "b", 67: "c", 68: "d", 69: "e", 70: "f", 71: "g", 72: "h", 73: "i", 74: "j",
  75: "k", 76: "l", 77: "m", 78: "n", 79: "o", 80: "p", 81: "q", 82: "r", 83: "s", 84: "t",
  85: "u", 86: "v", 87: "w", 88: "x", 89: "y", 90: "z",
  186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[", 220: "\\", 221: "]",
};

export interface ComboEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  keyCode?: number;
}

function partesDeEvento(evento: ComboEventLike): { mod: boolean; ctrl: boolean; alt: boolean; shift: boolean } {
  if (isMacPlatform()) {
    // En Mac el modificador principal es ⌘; Ctrl suelto es otro atajo, válido aparte.
    return { mod: evento.metaKey, ctrl: evento.ctrlKey && !evento.metaKey, alt: evento.altKey, shift: evento.shiftKey };
  }
  return { mod: evento.ctrlKey || evento.metaKey, ctrl: false, alt: evento.altKey, shift: evento.shiftKey };
}

/** ¿Este evento pulsa justo esta combinación? */
export function matchCombo(combo: string, evento: ComboEventLike): boolean {
  const parseada = parseCombo(combo);
  if (!parseada) return false;
  const mods = partesDeEvento(evento);
  if (parseada.mod !== mods.mod) return false;
  if (parseada.ctrl !== mods.ctrl) return false;
  if (parseada.alt !== mods.alt) return false;
  if (parseada.shift !== mods.shift) return false;
  const tecla = normalizeKeyToken(evento.key);
  if (tecla === parseada.key) return true;
  // Con Shift, el teclado entrega el carácter del modificador («&» en vez de «7»):
  // el `keyCode` dice qué tecla física era, que es lo único que no miente ahí.
  const porCodigo = evento.keyCode != null ? CODIGO_A_TECLA[evento.keyCode] : undefined;
  return porCodigo !== undefined && porCodigo === parseada.key;
}

/** La combinación que se está pulsando, o `null` si aún no es utilizable. */
export function comboFromEvent(evento: ComboEventLike): string | null {
  const mods = partesDeEvento(evento);
  const tecla = normalizeKeyToken(evento.key);
  const esFuncion = tecla !== null && /^F([1-9]|1[0-2])$/.test(tecla);
  const hayMod = mods.mod || mods.ctrl || mods.alt || mods.shift;
  if (tecla === null) return null;
  if (!hayMod && !esFuncion) return null;
  const partes = [
    mods.mod ? "Mod" : null,
    mods.ctrl ? "Ctrl" : null,
    mods.alt ? "Alt" : null,
    mods.shift ? "Shift" : null,
    tecla,
  ].filter((p): p is string => p !== null);
  const combo = partes.join("-");
  return isSafeCombo(combo) ? combo : null;
}

/** Las combinaciones repetidas: la combinación → acciones que la usan. */
export function duplicatesOf(map: ShortcutMap): Map<string, ShortcutActionId[]> {
  const porCombinacion = new Map<string, ShortcutActionId[]>();
  for (const accion of SHORTCUT_ACTIONS) {
    const combo = map[accion.id];
    const lista = porCombinacion.get(combo);
    if (lista) lista.push(accion.id);
    else porCombinacion.set(combo, [accion.id]);
  }
  for (const [combo, lista] of porCombinacion) {
    if (lista.length < 2) porCombinacion.delete(combo);
  }
  return porCombinacion;
}

/** Lee de JSON solo lo que es válido; lo demás se descarta sin más. */
export function sanitizeOverrides(value: unknown): ShortcutOverrides {
  if (!value || typeof value !== "object") return {};
  const resultado: ShortcutOverrides = {};
  for (const accion of SHORTCUT_ACTIONS) {
    const candidato = (value as Record<string, unknown>)[accion.id];
    if (typeof candidato !== "string") continue;
    const limpio = normalizeCombo(candidato);
    if (limpio === null || !isSafeCombo(limpio)) continue;
    // Lo que ya es el por defecto no se guarda: así el defecto puede cambiar.
    if (limpio === accion.defaultCombo) continue;
    resultado[accion.id] = limpio;
  }
  return resultado;
}

/** Defaults + overrides válidos. Una combinación repetida la gana el primero del catálogo. */
export function resolveShortcuts(overrides: ShortcutOverrides): ShortcutMap {
  const map = defaultShortcutMap();
  for (const accion of SHORTCUT_ACTIONS) {
    const combo = overrides[accion.id];
    if (combo && normalizeCombo(combo) !== null && isSafeCombo(combo)) {
      map[accion.id] = normalizeCombo(combo) as string;
    }
  }
  return map;
}

const TECLAS_DISPLAY: Record<string, string> = {
  Space: "Espacio", Enter: "Intro", Escape: "Esc", Backspace: "Retroceso", Delete: "Supr",
  Tab: "Tab", Insert: "Insert", Home: "Inicio", End: "Fin", PageUp: "RePág", PageDown: "AvPág",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
};

/** Tal y como se enseña en pantalla: con los símbolos del sistema o las palabras. */
export function formatCombo(combo: string, esMac: boolean): string {
  const parsed = parseCombo(combo);
  if (!parsed) return combo;
  const partes: string[] = [];
  if (parsed.mod) partes.push(esMac ? "⌘" : "Ctrl");
  if (parsed.ctrl) partes.push("Ctrl");
  if (parsed.alt) partes.push(esMac ? "⌥" : "Alt");
  if (parsed.shift) partes.push(esMac ? "⇧" : "Shift");
  partes.push(TECLAS_DISPLAY[parsed.key] ?? parsed.key.toUpperCase());
  return partes.join(esMac ? "" : " + ");
}
