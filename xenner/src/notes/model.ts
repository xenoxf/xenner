import type { LegacyNote } from "../types/legacy";

export const MAX_NOTE_ID_LENGTH = 128;
export const MAX_NOTE_TITLE_LENGTH = 1_024;
export const MAX_NOTE_BODY_LENGTH = 2_000_000;
export const MAX_STORED_NOTES = 10_000;
const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000;

export function isNote(value: unknown): value is LegacyNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;

  return (
    typeof note.id === "string" &&
    note.id.length > 0 &&
    note.id.length <= MAX_NOTE_ID_LENGTH &&
    note.id.trim() === note.id &&
    typeof note.title === "string" &&
    note.title.length <= MAX_NOTE_TITLE_LENGTH &&
    typeof note.body === "string" &&
    note.body.length <= MAX_NOTE_BODY_LENGTH &&
    typeof note.updatedAt === "number" &&
    Number.isSafeInteger(note.updatedAt) &&
    note.updatedAt >= 0 &&
    note.updatedAt <= MAX_DATE_TIMESTAMP
  );
}

export interface SanitizedNotes {
  notes: LegacyNote[];
  rejected: number;
}

export function sanitizeNotes(value: unknown): SanitizedNotes {
  if (!Array.isArray(value)) {
    return { notes: [], rejected: 1 };
  }

  const ids = new Set<string>();
  const notes: LegacyNote[] = [];
  let rejected = 0;

  for (const candidate of value) {
    if (!isNote(candidate) || ids.has(candidate.id)) {
      rejected += 1;
      continue;
    }
    if (notes.length >= MAX_STORED_NOTES) {
      rejected += 1;
      continue;
    }
    ids.add(candidate.id);
    notes.push(candidate);
  }

  return { notes, rejected };
}
