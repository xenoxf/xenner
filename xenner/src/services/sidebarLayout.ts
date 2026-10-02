/**
 * Cómo se recuerda la barra lateral entre sesiones: si sale desplegada y de qué
 * ancho la dejó quien la usa.
 *
 * Son dos preferencias de la ventana, no del contenido, así que viven en su
 * servicio y no en Apariencia —que es de tipografías y de lectura— ni en el
 * estado del workspace.
 *
 * El ancho se guarda solo cuando alguien lo arrastra. Sin ancho guardado se
 * devuelve `null` a propósito, para que manda el `clamp()` de la hoja CSS: un
 * número fijo de la última sesión dejaría el panel estrecho en una ventana
 * grande y con un hueco en una pequeña.
 */

export interface SidebarLayout {
  /** Si el panel de la lista de notas sale desplegado. */
  open: boolean;
  /** El ancho elegido al arrastrar, o `null` para el de la hoja CSS. */
  width: number | null;
}

/** Por debajo de esto no cabe un nombre de nota; por encima, el editor. */
export const SIDEBAR_WIDTH_MIN = 208;
export const SIDEBAR_WIDTH_MAX = 480;
/** Cuánto se mueve con las flechas del teclado. */
export const SIDEBAR_WIDTH_STEP = 16;
/** Lo que le queda al editor aunque el panel se estire. */
const EDITOR_MIN_WIDTH = 320;

const STORAGE_KEY = "xenner:sidebar:v1";

export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = { open: true, width: null };

/**
 * El tope de verdad en una ventana concreta.
 *
 * Los 480 px son un máximo absoluto, pero el que importa es el de esta ventana:
 * en una de 900 px un panel de 480 deja al editor con lo justo y descuadra la
 * lectura. Aquí nunca baja del mínimo ni sube del máximo absoluto, así que el
 * arrastre tampoco se queda sin recorrido.
 */
export function maxSidebarWidthFor(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return SIDEBAR_WIDTH_MAX;
  return Math.min(
    SIDEBAR_WIDTH_MAX,
    Math.max(SIDEBAR_WIDTH_MIN, Math.round(viewportWidth - EDITOR_MIN_WIDTH)),
  );
}

/** Un ancho válido y acotado. Lo que no es un número se queda en el mínimo. */
export function clampSidebarWidth(value: number, max = SIDEBAR_WIDTH_MAX): number {
  const ceiling = Math.max(SIDEBAR_WIDTH_MIN, Math.min(max, SIDEBAR_WIDTH_MAX));
  if (!Number.isFinite(value)) return SIDEBAR_WIDTH_MIN;
  return Math.min(ceiling, Math.max(SIDEBAR_WIDTH_MIN, Math.round(value)));
}

/**
 * Lo que se lee de `localStorage` es de otro y puede estar manipulado, así que
 * pasa por aquí antes de tocar el layout.
 */
export function sanitizeSidebarLayout(value: unknown): SidebarLayout {
  if (!value || typeof value !== "object") return { ...DEFAULT_SIDEBAR_LAYOUT };
  const candidate = value as Partial<SidebarLayout>;
  return {
    open: typeof candidate.open === "boolean" ? candidate.open : DEFAULT_SIDEBAR_LAYOUT.open,
    width:
      typeof candidate.width === "number" && Number.isFinite(candidate.width)
        ? clampSidebarWidth(candidate.width)
        : null,
  };
}

/**
 * El ancho como variable de CSS, o `undefined` para no escribir nada y que
 * mande la hoja. Devolver la cadena entera —y no un objeto para el atributo
 * `style`— es lo que permite que `undefined` signifique «déjalo como está».
 */
export function sidebarWidthVariable(width: number | null): string | undefined {
  return width === null ? undefined : `--sidebar-width: ${width}px`;
}

/** Lo mismo, partiendo del layout entero. */
export function sidebarWidthStyle(layout: SidebarLayout): string | undefined {
  return sidebarWidthVariable(layout.width);
}

export function readSidebarLayout(): SidebarLayout {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SIDEBAR_LAYOUT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SIDEBAR_LAYOUT };
    return sanitizeSidebarLayout(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_SIDEBAR_LAYOUT };
  }
}

export function saveSidebarLayout(layout: SidebarLayout): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSidebarLayout(layout)));
  } catch {
    // Cómo se ve la ventana no es esencial: si no se puede guardar, la sesión
    // siguiente empieza con el panel como estaba al abrir.
  }
}