// Parser de TXT de skins — SKIN_SPEC §3. Puro, sin dependencias.
//
// Las claves permitidas viven en `./keys.ts` para que no se dupliquen con el
// backend; aquí solo está la gramática del formato.

import { COMPONENT_KEYS, MANIFEST_KEYS, CONFIG_KEYS, allSkinKeys } from "./keys.ts";

const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

export { COMPONENT_KEYS };
export type ParsedSkinComponent = keyof typeof COMPONENT_KEYS;

function stripQuotes(v: string): string {
  if (v.length >= 2) {
    const a = v[0];
    const b = v[v.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

// Los TXT son entrada local, pero se tratan como no confiables. Se bloquean
// cuatro cosas, y conviene no confundir cuál es cuál:
//
//   - `expression()`, `-moz-binding`, `behavior:` y `javascript:`: funciones y
//     recursos CSS que ejecutan código o hacen peticiones. Muertos en cualquier
//     motor actual, pero se comprueban porque un WebView viejo en una distro
//     vieja existe.
//   - `@import`: una hoja remota. Además de la petición, esquivaría el
//     aislamiento de la skin.
//   - `!important`: NO es seguridad. El sistema depende de que una clave ausente
//     caiga en el valor embebido de `global.css`, y `!important` en el estilo
//     inline de <html> se saltaría esa cascada.
//   - `;`, `{`, `}` y caracteres de control fuera de un `url(...)`: no es
//     seguridad tampoco, es que un valor TXT es un único token y admitirlos
//     rompería el formato.
//
// Lo que SÍ se admite, y antes no: imágenes, SVG y tipografías. Un `url(...)`
// solo puede apuntar a un `data:` de tipo imagen o a una ruta dentro de la
// carpeta `assets/` de la propia skin; el backend lo comprueba otra vez al
// resolverlo, así que aquí es la primera puerta y no la única. Referencia:
// docs/SKIN_SPEC.md §3 y el doc de módulo de `src-tauri/src/skin.rs`.
const MAX_VALUE_LENGTH = 1024;
const BANNED_SUBSTRINGS = [
  "!important",
  "expression(",
  "@import",
  "-moz-binding",
  "behavior:",
  "javascript:",
] as const;

function isSafeReference(reference: string): boolean {
  if (!reference || reference.length > 512) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(reference)) return false;

  const lower = reference.toLowerCase();
  if (lower.startsWith("data:")) {
    // `;base64,` es la forma normal. Sin base64 solo se acepta SVG
    // percent-encoded, el único formato de imagen que es URL-safe.
    return (
      lower.startsWith("data:image/") &&
      (lower.includes(";base64,") ||
        lower.startsWith("data:image/svg+xml,") ||
        lower.startsWith("data:image/svg+xml;"))
    );
  }
  // Sin esquema: ni `://`, ni `//host`, ni ruta absoluta, ni `C:\`, ni `..`.
  if (lower.includes("://") || lower.startsWith("/") || lower.startsWith("\\")) return false;
  if (lower.length > 1 && lower[1] === ":") return false;
  return !reference.split(/[/\\]/).some((part) => part === "..");
}

function isSafeValue(v: string): boolean {
  if (!v || v.length > MAX_VALUE_LENGTH) return false;
  if (/[\u0000-\u001f\u007f<>]/.test(v)) return false;

  const lower = v.toLowerCase();
  for (const banned of BANNED_SUBSTRINGS) {
    if (lower.includes(banned)) return false;
  }

  // Un solo recorrido: dentro de `url()` el `;` es legítimo (los `data:` lo
  // llevan), fuera rompería el formato. Se separa cada trozo y se valida con sus
  // propias reglas. Mismo criterio que `safe_component_value` en Rust.
  let outside = "";
  let cursor = 0;
  while (cursor < v.length) {
    if (lower.startsWith("url(", cursor)) {
      const openEnd = cursor + 4;
      const close = lower.indexOf(")", openEnd);
      if (close === -1) return false;
      const reference = v.slice(openEnd, close).replace(/^[\s'"]+|[\s'"]+$/g, "");
      if (!isSafeReference(reference)) return false;
      cursor = close + 1;
    } else {
      outside += v[cursor];
      cursor += 1;
    }
  }

  return !outside.toLowerCase().includes("data:") && !/[;{}]/.test(outside);
}

function parseWithKeys(
  text: string,
  allowedKeys: readonly string[],
): Record<string, string> {
  const allowed = new Set(allowedKeys);
  const out: Record<string, string> = {};
  if (!text) return out;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!KEY_RE.test(key) || !allowed.has(key)) continue;

    const value = stripQuotes(line.slice(eq + 1).trim());
    if (!isSafeValue(value)) continue;
    out[key] = value;
  }

  return out;
}

/** Parseo genérico. Las allowlists de producción se aplican abajo. */
export function parseSkinTxt(text: string): Record<string, string> {
  return parseWithKeys(text, allSkinKeys());
}

export function parseSkinComponent(
  component: ParsedSkinComponent,
  text: string,
): Record<string, string> {
  return parseWithKeys(text, COMPONENT_KEYS[component]);
}

export function parseSkinManifest(text: string): Record<string, string> {
  return parseWithKeys(text, MANIFEST_KEYS);
}

export function parseSkinConfig(text: string): Record<string, string> {
  return parseWithKeys(text, CONFIG_KEYS);
}
