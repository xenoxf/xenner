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
  //
  // Se avanza carácter a carácter y no unidad a unidad: en JavaScript un emoji
  // o un carácter fuera del plano básico ocupa dos unidades, y recorrerlas por
  // separado parte el texto por la mitad. El backend tenía este mismo recorrido
  // byte a byte y una `á` lo tumbaba.
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
      continue;
    }
    const punto = v.codePointAt(cursor);
    const largo = punto !== undefined && punto > 0xffff ? 2 : 1;
    outside += v.slice(cursor, cursor + largo);
    cursor += largo;
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

export interface IgnoredLine {
  /** El número de línea contando desde 1, como lo enseña un editor. */
  line: number;
  /** La clave que no va a aplicarse, o `""` si la línea no es `clave=valor`. */
  key: string;
  /** Por qué no: una frase, no un código. */
  why: IgnoredReason;
}

export type IgnoredReason =
  | "clave-ajena"
  | "sin-igual"
  | "valor-invalido"
  | "clave-vacia";

/**
 * Las líneas de un `.txt` que Xenner va a pasar por alto, y por qué.
 *
 * No bloquea nada: el cargador las ignora en silencio, que es lo que permite que
 * un theme roto no rompa la app. Pero «en silencio» y «sin que nadie lo diga» son
 * cosas distintas, y quien está escribiendo un archivo necesita lo segundo. Por
 * eso esto informa y no corrige.
 *
 * Comparte `isSafeValue` y la allowlist con el parseo de verdad, así que no
 * puede señalar una línea que en realidad sí va a funcionar. Duplicar estas
 * reglas aquí es exactamente lo que salió mal la última vez que se duplicaron
 * (`keys.ts`, y su comentario explica por qué).
 */
export function ignoredSkinLines(
  component: ParsedSkinComponent,
  text: string,
): IgnoredLine[] {
  const allowed = new Set<string>(COMPONENT_KEYS[component]);
  const out: IgnoredLine[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;

    const eq = line.indexOf("=");
    if (eq < 0) {
      out.push({ line: index + 1, key: "", why: "sin-igual" });
      return;
    }

    const key = line.slice(0, eq).trim();
    if (!key) {
      out.push({ line: index + 1, key: "", why: "clave-vacia" });
      return;
    }
    if (!allowed.has(key)) {
      out.push({ line: index + 1, key, why: "clave-ajena" });
      return;
    }

    const value = stripQuotes(line.slice(eq + 1).trim());
    if (!isSafeValue(value)) {
      out.push({ line: index + 1, key, why: "valor-invalido" });
    }
  });

  return out;
}

/** La frase que se le enseña a la persona, sin jerga de parseador. */
export function explainIgnoredLine(line: IgnoredLine): string {
  switch (line.why) {
    case "clave-ajena":
      return `La línea ${line.line}: «${line.key}» no es una clave de este archivo, así que Xenner la pasa por alto.`;
    case "sin-igual":
      return `La línea ${line.line} no tiene el signo «=», así que Xenner la pasa por alto.`;
    case "clave-vacia":
      return `La línea ${line.line} no tiene nombre antes del «=», así que Xenner la pasa por alto.`;
    case "valor-invalido":
      return `La línea ${line.line}: el valor de «${line.key}» no es válido, así que Xenner la pasa por alto.`;
  }
}

/** El texto entero de un componente, con los valores de un mapa ya puestos. */
export function stringifySkinComponent(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n");
}
