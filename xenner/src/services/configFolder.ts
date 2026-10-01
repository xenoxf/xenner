import { invoke } from "@tauri-apps/api/core";

import type { ConfigInfo } from "../types/config";

/**
 * Dónde está la carpeta de Xenner, y cómo abrirla.
 *
 * Existe por un motivo concreto: la documentación dice que los temas son unos
 * archivos tuyos, y para que eso sea verdad la persona tiene que poder llegar a
 * ellos. Una ruta dentro de `AppData` no se encuentra; un botón en Ajustes, sí.
 *
 * Sin Tauri —la previsualización en el navegador— no hay carpeta ninguna, y el
 * servicio lo dice con `null` en vez de inventar una ruta.
 */

/** La carpeta ya creada, o `null` si esta build no puede saber dónde está. */
let cache: ConfigInfo | null = null;

export async function readConfigInfo(): Promise<ConfigInfo | null> {
  if (cache) return cache;
  try {
    cache = await invoke<ConfigInfo>("config_info");
  } catch {
    cache = null;
  }
  return cache;
}

/**
 * Abre la carpeta en el explorador de archivos del sistema.
 *
 * Devuelve el motivo si no pudo, para poder decirlo en voz alta en vez de
 * dejar un botón que no hace nada y parece roto.
 */
export async function revealConfigDir(): Promise<string | null> {
  try {
    await invoke<void>("reveal_config_dir");
    return null;
  } catch (error) {
    return error instanceof Error && error.message ? error.message : "No se pudo abrir la carpeta.";
  }
}

/** La ruta, preparada para poder seleccionarla y copiarla con el ratón. */
export function selectPath(path: string): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const area = document.createElement("textarea");
  area.value = path;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";
  document.body.append(area);
  area.select();
  try {
    document.execCommand("copy");
  } catch {
    // Sin permiso de portapapeles: al menos el texto queda seleccionado, y se
    // puede copiar con el teclado.
  }
  area.remove();
  window.getSelection()?.removeAllRanges();
}

/**
 * El nombre corto de la carpeta, para el botón: «Abrir la carpeta de Xenner» es
 * más claro que repetir la ruta entera, que no cabe en un botón.
 */
export function configFolderName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const last = trimmed.split(/[/\\]/).pop();
  return last && last.length > 0 ? last : "xenner";
}
