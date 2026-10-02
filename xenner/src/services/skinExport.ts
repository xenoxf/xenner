import { invoke, isTauri } from "@tauri-apps/api/core";

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
