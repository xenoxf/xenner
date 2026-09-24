import { sanitizeNotes, type Note } from "./model";

const LEGACY_KEY = "xenner:notes:v1";

export interface LegacyNotesResult {
  notes: Note[];
  raw: string | null;
  issue: string | null;
}

export function readLegacyNotes(): LegacyNotesResult {
  if (typeof localStorage === "undefined") return { notes: [], raw: null, issue: null };
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return { notes: [], raw: null, issue: null };
    const sanitized = sanitizeNotes(JSON.parse(raw) as unknown);
    return {
      notes: sanitized.notes,
      raw,
      issue: sanitized.rejected
        ? `Se omitieron ${sanitized.rejected} notas antiguas inválidas.`
        : null,
    };
  } catch (error) {
    return {
      notes: [],
      raw,
      issue: `No se pudo leer el almacenamiento anterior: ${error instanceof Error ? error.message : "error desconocido"}`,
    };
  }
}

export function legacyNotesKey(): string {
  return LEGACY_KEY;
}
