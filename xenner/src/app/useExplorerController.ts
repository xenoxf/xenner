import { createSignal } from "solid-js";

import { notifySuccess } from "../services/toastService";
import { readLegacyNotes } from "../services/legacyNotes";
import type { LegacyNote } from "../types/legacy";
import { baseName } from "../utils/paths";
import {
  createFolder,
  createNote,
  deleteEntry,
  expandFolder,
  importLegacyNotes,
  renameEntry,
} from "../workspace/store";
import type { CreationDraft } from "../components/explorer/Explorer";
import type { CreationKind } from "../components/explorer/CreationRow";

const LEGACY_IMPORT_KEY = "xenner:legacy-import:v1";

function previouslyImported(root: string | undefined): Set<string> {
  try {
    const raw = localStorage.getItem(LEGACY_IMPORT_KEY);
    const marker = raw ? (JSON.parse(raw) as { root?: string; ids?: string[] }) : null;
    if (marker && marker.root === root && Array.isArray(marker.ids)) return new Set(marker.ids);
  } catch {
    // Un marcador inválido solo hace que Xenner vuelva a comprobar cada nota.
  }
  return new Set();
}

export function useExplorerController() {
  const [creation, setCreation] = createSignal<CreationDraft | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [legacyNotes, setLegacyNotes] = createSignal<LegacyNote[]>([]);
  const [legacyIssue, setLegacyIssue] = createSignal<string | null>(null);

  async function createUntitledNote(parent = ""): Promise<void> {
    if (creating()) return;
    setCreating(true);
    try {
      const path = await createNote(parent);
      if (path) notifySuccess("Nota creada", baseName(path));
    } finally {
      setCreating(false);
    }
  }

  function startCreation(kind: CreationKind, parent = ""): void {
    if (parent) expandFolder(parent);
    if (kind === "note") {
      void createUntitledNote(parent);
      return;
    }
    setCreation({ kind, parent });
  }

  async function submitCreation(name: string): Promise<void> {
    const draft = creation();
    if (!draft || creating()) return;
    setCreating(true);
    try {
      const result = await createFolder(draft.parent, name);
      if (result) {
        setCreation(null);
        notifySuccess("Carpeta creada", baseName(result.path));
      }
    } finally {
      setCreating(false);
    }
  }

  function loadLegacyNotes(root: string | undefined): void {
    const legacy = readLegacyNotes();
    const imported = previouslyImported(root);
    setLegacyNotes(legacy.notes.filter((note) => !imported.has(note.id)));
    setLegacyIssue(legacy.issue);
  }

  async function importOldNotes(): Promise<void> {
    const notes = legacyNotes();
    if (!notes.length) return;
    const confirmed = window.confirm(
      `Se importarán ${notes.length} notas antiguas a la carpeta Importadas. La copia local original se conserva. ¿Continuar?`,
    );
    if (!confirmed) return;
    const imported = await importLegacyNotes(notes);
    if (imported > 0) {
      setLegacyNotes([]);
      setLegacyIssue(null);
      notifySuccess("Notas importadas", `${imported} ${imported === 1 ? "nota" : "notas"}`);
    }
  }

  async function rename(path: string): Promise<void> {
    const currentName = path.slice(path.lastIndexOf("/") + 1);
    const nextName = window.prompt("Nuevo nombre", currentName)?.trim();
    if (!nextName || nextName === currentName) return;
    const renamed = await renameEntry(path, nextName);
    if (renamed) notifySuccess("Elemento renombrado", baseName(renamed));
  }

  async function remove(path: string): Promise<void> {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const confirmed = window.confirm(
      path.toLocaleLowerCase("es").endsWith(".md")
        ? `¿Eliminar “${name}”? Esta acción no se puede deshacer.`
        : `¿Eliminar la carpeta “${name}”? Solo se puede eliminar si está vacía.`,
    );
    if (confirmed) {
      const deleted = await deleteEntry(path);
      if (deleted) notifySuccess("Elemento eliminado", name);
    }
  }

  return {
    creation,
    creating,
    legacyNotes,
    legacyIssue,
    setCreation,
    startCreation,
    submitCreation,
    loadLegacyNotes,
    importOldNotes,
    rename,
    remove,
  };
}
