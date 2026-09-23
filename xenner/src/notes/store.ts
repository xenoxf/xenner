// CRUD de notas — fase 1: localStorage (clave xenner:notes:v1).
// Puro SolidJS, sin backend. Nunca lanza: storage roto → lista vacía.

import { createSignal } from "solid-js";

export interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

const STORAGE_KEY = "xenner:notes:v1";

function isNote(v: unknown): v is Note {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.title === "string" &&
    typeof n.body === "string" &&
    typeof n.updatedAt === "number"
  );
}

function readAll(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNote);
  } catch {
    return [];
  }
}

function persist(notes: Note[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    /* cuota llena o storage bloqueado: la app sigue con la señal en memoria */
  }
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fallback abajo */
  }
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const [notes, setNotes] = createSignal<Note[]>(readAll());

export function listNotes(): Note[] {
  return notes();
}

export function createNote(): Note {
  const note: Note = {
    id: newId(),
    title: "",
    body: "",
    updatedAt: Date.now(),
  };
  setNotes((prev) => {
    const next = [note, ...prev];
    persist(next);
    return next;
  });
  return note;
}

export function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "body">>,
): void {
  setNotes((prev) => {
    let touched = false;
    const next = prev.map((n) => {
      if (n.id !== id) return n;
      touched = true;
      return { ...n, ...patch, updatedAt: Date.now() };
    });
    if (touched) persist(next);
    return next;
  });
}

export function deleteNote(id: string): void {
  setNotes((prev) => {
    const next = prev.filter((n) => n.id !== id);
    if (next.length !== prev.length) persist(next);
    return next;
  });
}
