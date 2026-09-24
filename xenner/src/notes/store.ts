// CRUD de notas — fase 1: localStorage (clave xenner:notes:v1).
// SolidJS solo para el estado; las validaciones viven en model.ts.

import { createSignal } from "solid-js";
import {
  isNote,
  MAX_NOTE_BODY_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  sanitizeNotes,
  type Note,
} from "./model";

export type { Note } from "./model";

export type StorageStatus = "saved" | "saving" | "error";

const STORAGE_KEY = "xenner:notes:v1";
const SAVE_DELAY_MS = 300;

interface ReadResult {
  notes: Note[];
  issue: string | null;
  corruptRaw: string | null;
}

let pendingNotes: Note[] | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unrecoverableCorruptRaw: string | null = null;

function readAll(): ReadResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { notes: [], issue: null, corruptRaw: null };

    const sanitized = sanitizeNotes(JSON.parse(raw) as unknown);
    if (sanitized.rejected === 0) {
      return { notes: sanitized.notes, issue: null, corruptRaw: null };
    }

    return {
      notes: sanitized.notes,
      issue: `Se omitieron ${sanitized.rejected} entradas inválidas al abrir el almacenamiento.`,
      corruptRaw: raw,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "error desconocido";
    return {
      notes: [],
      issue: `No se pudo leer el almacenamiento local: ${message}`,
      corruptRaw: raw,
    };
  }
}

const initial = readAll();
const [notes, setNotes] = createSignal<Note[]>(initial.notes);
const [storageStatus, setStorageStatus] = createSignal<StorageStatus>(
  initial.issue ? "error" : "saved",
);
const [storageError, setStorageError] = createSignal<string | null>(initial.issue);

function backupCorruptData(raw: string): boolean {
  try {
    localStorage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw);
    return true;
  } catch {
    return false;
  }
}

if (initial.corruptRaw) {
  if (backupCorruptData(initial.corruptRaw)) {
    setStorageError(`${initial.issue} Se conservó una copia de recuperación.`);
  } else {
    unrecoverableCorruptRaw = initial.corruptRaw;
    setStorageError(
      `${initial.issue} No se pudo crear la copia; se bloqueó la sobrescritura para proteger los datos.`,
    );
  }
}

function setWriteError(error: unknown): void {
  const message = error instanceof Error ? error.message : "error desconocido";
  setStorageStatus("error");
  setStorageError(`No se pudo guardar; los cambios siguen solo en memoria. ${message}`);
}

function writeNow(next: Note[]): boolean {
  if (unrecoverableCorruptRaw) {
    setStorageStatus("error");
    setStorageError(
      "No se puede guardar hasta que se libere el almacenamiento corrupto. Tus cambios siguen solo en memoria.",
    );
    return false;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setStorageStatus("saved");
    setStorageError(null);
    return true;
  } catch (error) {
    setWriteError(error);
    return false;
  }
}

function scheduleWrite(next: Note[]): void {
  pendingNotes = next;
  setStorageStatus("saving");
  setStorageError(null);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPending, SAVE_DELAY_MS);
}

export function flushPending(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!pendingNotes) return;
  const next = pendingNotes;
  pendingNotes = null;
  writeNow(next);
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // Fallback local al bloque siguiente.
  }
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function listNotes(): Note[] {
  return notes();
}

export function getStorageStatus(): StorageStatus {
  return storageStatus();
}

export function getStorageError(): string | null {
  return storageError();
}

export function createNote(): Note {
  const note: Note = {
    id: newId(),
    title: "",
    body: "",
    updatedAt: Date.now(),
  };
  setNotes((previous) => {
    const next = [note, ...previous];
    scheduleWrite(next);
    return next;
  });
  return note;
}

export function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "body">>,
): boolean {
  if (patch.title !== undefined && patch.title.length > MAX_NOTE_TITLE_LENGTH) {
    setStorageStatus("error");
    setStorageError(`El título supera el límite de ${MAX_NOTE_TITLE_LENGTH} caracteres.`);
    return false;
  }
  if (patch.body !== undefined && patch.body.length > MAX_NOTE_BODY_LENGTH) {
    setStorageStatus("error");
    setStorageError(`La nota supera el límite de ${MAX_NOTE_BODY_LENGTH} caracteres.`);
    return false;
  }

  let changed = false;
  setNotes((previous) => {
    const next = previous.map((note) => {
      if (note.id !== id) return note;
      changed = true;
      const candidate = { ...note, ...patch, updatedAt: Date.now() };
      return isNote(candidate) ? candidate : note;
    });
    if (changed) scheduleWrite(next);
    return next;
  });
  return changed;
}

export function deleteNote(id: string): void {
  setNotes((previous) => {
    const next = previous.filter((note) => note.id !== id);
    if (next.length !== previous.length) scheduleWrite(next);
    return next;
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPending);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPending();
  });
}
