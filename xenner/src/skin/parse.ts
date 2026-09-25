// Parser de TXT de skins — SKIN_SPEC §3. Puro, sin dependencias.

const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const MAX_VALUE_LENGTH = 1024;

const SHARED_KEYS = [
  "background",
  "text",
  "border",
  "radius",
  "blur",
  "shadow",
  "accent",
  "font",
] as const;

export const COMPONENT_KEYS = {
  background: [...SHARED_KEYS, "textDim", "overlay"],
  button: [...SHARED_KEYS, "backgroundHover", "textHover", "borderHover"],
  note: [...SHARED_KEYS, "backgroundHover"],
  sidebar: [...SHARED_KEYS, "itemHover", "itemActive", "textDim"],
  input: [...SHARED_KEYS, "placeholder", "focus"],
  toolbar: [...SHARED_KEYS, "textDim", "backgroundHover"],
} as const;

const MANIFEST_KEYS = ["name", "version", "author"] as const;
const CONFIG_KEYS = ["skinPath"] as const;

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

// Los TXT son entrada local, pero se tratan como no confiables: además de
// impedir ruptura de declaraciones, bloqueamos funciones/recursos CSS que
// puedan ejecutar código o provocar peticiones de red.
function isSafeValue(v: string): boolean {
  if (!v || v.length > MAX_VALUE_LENGTH) return false;
  if (/[\u0000-\u001f\u007f<>]/.test(v)) return false;

  const normalized = v.toLowerCase();
  if (normalized.includes("!important")) return false;
  if (normalized.includes("url(")) return false;
  if (
    normalized.includes("expression(") ||
    normalized.includes("@import") ||
    normalized.includes("-moz-binding") ||
    normalized.includes("javascript:") ||
    normalized.includes("data:")
  ) {
    return false;
  }

  return !/[;{}]/.test(v);
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
  return parseWithKeys(text, allKeys());
}

function allKeys(): string[] {
  return [
    ...new Set([
      ...SHARED_KEYS,
      ...MANIFEST_KEYS,
      ...CONFIG_KEYS,
      ...Object.values(COMPONENT_KEYS).flat(),
    ]),
  ];
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
