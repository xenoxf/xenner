/**
 * Las combinaciones de teclado, guardadas tal y como las dejó su dueño.
 *
 * Igual que el aspecto: `localStorage`, con una clave con versión, y la
 * lectura pasa siempre por el saneado de `data/shortcuts.ts`. Un ajuste que no
 * se entiende no rompe la app: se ignora, y el valor por defecto gana.
 *
 * Lo que se guarda son **solo las diferencias** con el por defecto: así, cuando
 * un atajo nuevo se añade al catálogo, aparece sin pedir permiso y un cambio en
 * los valores por defecto no pisa una elección a mano salvo en esa tecla.
 */
import {
  defaultShortcutMap,
  resolveShortcuts,
  sanitizeOverrides,
  type ShortcutActionId,
  type ShortcutMap,
  type ShortcutOverrides,
} from "../data/shortcuts.ts";

const STORAGE_KEY = "xenner:shortcuts:v1";

let overridesCache: ShortcutOverrides | null = null;
let mapCache: ShortcutMap | null = null;

export function readShortcutOverrides(): ShortcutOverrides {
  if (overridesCache) return overridesCache;
  if (typeof localStorage === "undefined") {
    overridesCache = {};
    return overridesCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    overridesCache = sanitizeOverrides(raw ? JSON.parse(raw) : {});
  } catch {
    overridesCache = {};
  }
  return overridesCache;
}

export function readShortcuts(): ShortcutMap {
  if (!mapCache) mapCache = resolveShortcuts(readShortcutOverrides());
  return mapCache;
}

/**
 * El mapa vivo para los manejadores de teclas.
 *
 * Es una función y no una copia para que un cambio en Ajustes surta efecto en
 * la siguiente pulsación, sin recrear el editor ni los listeners.
 */
export const liveShortcuts = readShortcuts;

function persist(next: ShortcutOverrides): ShortcutOverrides {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Un fallo de almacenamiento no puede impedir seguir escribiendo.
    }
  }
  overridesCache = next;
  mapCache = resolveShortcuts(next);
  return next;
}

/** Asigna una combinación ya validada; si es la de fábrica, se borra el ajuste. */
export function saveShortcut(id: ShortcutActionId, combo: string): ShortcutOverrides {
  const limpio = sanitizeOverrides({ [id]: combo })[id];
  const actual = { ...readShortcutOverrides() };
  if (limpio === undefined || limpio === defaultShortcutMap()[id]) {
    delete actual[id];
  } else {
    actual[id] = limpio;
  }
  return persist(actual);
}

/** Devuelve una acción a su valor por defecto. */
export function resetShortcut(id: ShortcutActionId): ShortcutOverrides {
  const actual = { ...readShortcutOverrides() };
  delete actual[id];
  return persist(actual);
}

/** Devuelve todo a los valores de fábrica. */
export function resetAllShortcuts(): ShortcutOverrides {
  return persist({});
}

/**
 * Si alguien está capturando una combinación en Ajustes.
 *
 * Mientras se captura, los manejadores globales se quedan quietos: si el
 * usuario graba `Mod-e` para cualquier cosa, la lista de notas no se contrae
 * como efecto secundario de grabar su atajo.
 */
let capturing = false;

export function isCapturingCombo(): boolean {
  return capturing;
}

export function setCapturingCombo(value: boolean): void {
  capturing = value;
}
