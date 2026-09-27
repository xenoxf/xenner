/**
 * Recarga la skin cuando cambian sus archivos.
 *
 * Antes había que cerrar y abrir la aplicación para ver un cambio, y la web
 * llegó a prometer lo contrario. Aquí se sondea como ya se hace con la
 * biblioteca de notas (`workspace/store.ts`): un `setInterval` que pide las
 * fechas de modificación y solo recarga si ha cambiado algo.
 *
 * Sondeo y no eventos del sistema de archivos porque no hay forma de pedirlos
 * desde Tauri v2 sin un plugin, y porque 2,5 s es lo que ya aguanta la
 * biblioteca. El coste es una llamada barata por intervalo y solo cuando hay
 * una ventana de skin activa.
 */

import { invoke } from "@tauri-apps/api/core";

import type { LoadedSkin } from "../types/skin";
import { SKIN_COMPONENTS, loadSkin } from "./skinLoader";

/** Los ficheros cuyo contenido(o existencia) defines el aspecto. */
const WATCHED_FILES = [...SKIN_COMPONENTS, "custom"] as const;

export const SKIN_POLL_INTERVAL_MS = 2_500;

/** Firmas de los archivos de la skin activa: `ruta:tamaño:mtime`. */
async function skinFingerprint(skin: string): Promise<string> {
  const parts: string[] = [];
  for (const file of WATCHED_FILES) {
    try {
      const stamp = await invoke<string | null>("skin_file_stamp", { skin, file });
      parts.push(`${file}=${stamp ?? "-"}`);
    } catch {
      // El comando no existe (build viejo) o falló: se marca para no recargar
      // en bucle. La recarga se hace igual al cambiar de skin.
      parts.push(`${file}=?`);
    }
  }
  return parts.join("|");
}

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let lastFingerprint = "";
let lastSkin = "";

export function stopSkinWatcher(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  lastFingerprint = "";
  lastSkin = "";
}

/**
 * Empieza a vigilar `skin`. Devuelve la función de parada, como el resto de
 * watchers de la app.
 */
export function startSkinWatcher(
  activeId: () => string,
  onReload: (loaded: LoadedSkin) => void,
): () => void {
  stopSkinWatcher();
  if (timer !== null) return stopSkinWatcher;

  // La primera pasada fija la referencia; desde ahí solo reacts a cambios.
  void skinFingerprint(activeId()).then((fingerprint) => {
    lastFingerprint = fingerprint;
    lastSkin = activeId();
  });

  timer = setInterval(async () => {
    if (inFlight) return;
    const skin = activeId();
    if (!skin) return;
    // Cambiar de skin reinicia la referencia: si no, el cambio se detectaría
    // como una modificación y recargaría dos veces.
    if (skin !== lastSkin) {
      lastSkin = skin;
      lastFingerprint = await skinFingerprint(skin);
      return;
    }

    inFlight = true;
    try {
      const fingerprint = await skinFingerprint(skin);
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      onReload(await loadSkin(skin));
    } catch {
      // Una recarga fallida no para el sondeo: la siguiente puede funcionar.
    } finally {
      inFlight = false;
    }
  }, SKIN_POLL_INTERVAL_MS);

  return stopSkinWatcher;
}
