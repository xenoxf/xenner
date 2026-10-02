import { invoke, isTauri } from "@tauri-apps/api/core";

import type { SkinInfo } from "../types/skin";

/**
 * Exportar un tema: la carpeta entera, lista para copiar a otro equipo o
 * guardar como copia. Es el atajo de «abrir la carpeta de temas y copiarla a
 * mano», pero sin tener que saber dónde está esa carpeta.
 *
 * En el navegador (modo previsualización) no hay disco que compartir: se
 * enseña el motivo y punto.
 */
export async function exportSkin(id: string): Promise<string | null> {
  if (!isTauri()) {
    throw new Error("Exportar un tema solo funciona en la aplicación de escritorio.");
  }
  return invoke<string | null>("export_skin", { skin: id });
}

/**
 * Importar un tema con un clic: elegir la carpeta y listo. Devuelve el tema
 * ya instalado, o `null` si se canceló.
 */
export async function importSkin(): Promise<SkinInfo | null> {
  if (!isTauri()) {
    throw new Error("Importar un tema solo funciona en la aplicación de escritorio.");
  }
  return invoke<SkinInfo | null>("import_skin");
}
