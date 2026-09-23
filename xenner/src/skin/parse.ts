// Parser de TXT de skins — SKIN_SPEC §3. Puro, sin dependencias.

const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

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

// Anti-CSS-injection: valor con !important, ; o llaves → se ignora.
function isSafeValue(v: string): boolean {
  if (!v) return false;
  if (v.toLowerCase().includes("!important")) return false;
  if (v.includes(";") || v.includes("{") || v.includes("}")) return false;
  return true;
}

/**
 * Parsea un TXT de componente a `clave => valor`.
 * Reglas: `#` = comentario, líneas vacías se ignoran, comillas opcionales,
 * clave duplicada → gana la última, clave con caracteres peligrosos o valor
 * inseguro → la línea se ignora (la clave ausente cae en la default embebida).
 */
export function parseSkinTxt(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!KEY_RE.test(key)) continue;
    const value = stripQuotes(line.slice(eq + 1).trim());
    if (!isSafeValue(value)) continue;
    out[key] = value;
  }
  return out;
}
