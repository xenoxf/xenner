/**
 * Resuelve los `url(...)` de una skin a `data:` URLs.
 *
 * Por qué no se leen las imágenes del disco desde el frontend: porque entonces
 * el navegador las pediría por su cuenta y el único control sería una cadena de
 * texto. En vez de eso, cada referencia se pasa por el comando
 * `read_skin_asset`, que es el único punto de entrada y comprueba extensión,
 * tamaño, tipo de archivo y que la ruta no se salga de la carpeta de la skin
 * (canonicalizando, así que corta también los enlaces simbólicos). Aquí solo se
 * recoge el resultado.
 *
 * Referencia: el doc de módulo de `src-tauri/src/skin.rs` y SKIN_SPEC §4.2.
 */

import { invoke } from "@tauri-apps/api/core";

/** `data:` que ya viene dentro del texto, o una ruta: no hay nada que pedir. */
const DATA_URL_RE = /^data:image\//i;
const URL_TOKEN_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*))\s*\)/gi;

export interface ResolveUrlsOptions {
  /** Se llama con cada ruta que hay que pedir al backend. */
  fetchAsset: (path: string) => Promise<string | null>;
  /** Sustituye una referencia que el backend no ha podido resolver. */
  onMissing?: (path: string) => void;
}

/** Todas las referencias `url(...)` distintas que aparecen en un texto. */
export function collectUrlReferences(css: string): string[] {
  const found: string[] = [];
  for (const match of css.matchAll(URL_TOKEN_RE)) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (raw && !DATA_URL_RE.test(raw)) found.push(raw);
  }
  return [...new Set(found)];
}

/**
 * Reescribe los `url(...)` de un texto CSS o de un valor TXT sustituyendo las
 * rutas de `assets/` por `data:` URLs.
 *
 * Una referencia que no se puede resolver no se toca: se deja tal cual para que
 * el CSS la ignore y la superficie conserve su aspecto por defecto. Perder una
 * imagen siempre es mejor que romper el componente entero.
 */
export async function resolveSkinUrls(
  css: string,
  { fetchAsset, onMissing }: ResolveUrlsOptions,
): Promise<string> {
  const references = collectUrlReferences(css);
  if (references.length === 0) return css;

  const resolved = new Map<string, string>();
  await Promise.all(
    references.map(async (reference) => {
      try {
        const dataUrl = await fetchAsset(reference);
        if (dataUrl) resolved.set(reference, dataUrl);
        else onMissing?.(reference);
      } catch {
        onMissing?.(reference);
      }
    }),
  );
  if (resolved.size === 0) return css;

  // Un solo regex con `replace` es delicado aquí: las data URLs contienen
  // paréntesis (`data:...;base64,...` no, pero un SVG percent-encoded sí), así
  // que se sustituye por trozos en vez de por callback sobre el match completo.
  let output = "";
  let cursor = 0;
  for (const match of css.matchAll(URL_TOKEN_RE)) {
    const start = match.index ?? 0;
    const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    const replacement = resolved.get(raw);
    if (!replacement) continue;
    output += css.slice(cursor, start) + `url("${replacement}")`;
    cursor = start + match[0].length;
  }
  output += css.slice(cursor);
  return output;
}

/** La versión de producción: pide el asset al backend de Tauri. */
export function tauriAssetFetcher(skin: string): (path: string) => Promise<string | null> {
  return async (path: string) => {
    try {
      return await invoke<string>("read_skin_asset", { skin, path });
    } catch {
      return null;
    }
  };
}
