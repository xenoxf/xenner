import { createSignal } from "solid-js";

import { notifyError, notifySuccess } from "../services/toastService";
import { saveActiveWhiteboard } from "../services/editorSession";
import { getWorkspaceGateway } from "../services/workspace/gateway";
import { readLegacyNotes } from "../services/legacyNotes";
import type { LegacyNote } from "../types/legacy";
import { baseName } from "../utils/paths";
import { serializeNoteContent } from "../workspace/note";
import {
  createFolder,
  createNote,
  deleteEntry,
  expandFolder,
  flushPendingSave,
  getSelectedDocument,
  getSelectedPath,
  getWorkspace,
  importLegacyNotes,
  moveEntry,
  renameEntry,
} from "../workspace/store";
import type { CreationDraft } from "../components/explorer/Explorer";
import type { CreationKind } from "../components/explorer/CreationRow";

const LEGACY_IMPORT_KEY = "xenner:legacy-import:v1";

interface CutEntry {
  path: string;
  root: string;
}

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

async function writeClipboardText(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // El WebView puede rechazar la API; se intenta el fallback.
    }
  }
  if (typeof document === "undefined") throw new Error("El portapapeles no está disponible");
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("El portapapeles no está disponible");
}

export function useExplorerController() {
  const [creation, setCreation] = createSignal<CreationDraft | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [legacyNotes, setLegacyNotes] = createSignal<LegacyNote[]>([]);
  const [legacyIssue, setLegacyIssue] = createSignal<string | null>(null);
  const [cutEntry, setCutEntry] = createSignal<CutEntry | null>(null);

  function currentCut(): CutEntry | null {
    const entry = cutEntry();
    return entry && entry.root === getWorkspace()?.info.root ? entry : null;
  }

  function cutPath(): string | null {
    return currentCut()?.path ?? null;
  }

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

  async function copyMarkdown(path: string): Promise<void> {
    try {
      if (!(await saveActiveWhiteboard(false)) || !(await flushPendingSave())) {
        throw new Error("No se pudo guardar el contenido antes de copiar");
      }
      const selected = getSelectedPath() === path ? getSelectedDocument() : null;
      const document = selected ?? await getWorkspaceGateway().readNote(path);
      await writeClipboardText(serializeNoteContent(document.title, document.body));
      notifySuccess("Markdown copiado", baseName(path));
    } catch (error) {
      notifyError("No se pudo copiar el Markdown", error);
    }
  }

  function cut(path: string): void {
    const root = getWorkspace()?.info.root;
    if (!root) {
      notifyError("No se puede cortar sin una biblioteca activa", "La biblioteca no está disponible");
      return;
    }
    setCutEntry({ path, root });
    notifySuccess("Elemento listo para mover", baseName(path));
  }

  async function paste(parent: string): Promise<void> {
    const entry = currentCut();
    if (!entry) {
      setCutEntry(null);
      return;
    }
    const moved = await moveEntry(entry.path, parent);
    if (moved) {
      setCutEntry(null);
      notifySuccess("Elemento movido", baseName(moved));
    }
  }

  async function move(path: string, parent: string): Promise<void> {
    const moved = await moveEntry(path, parent);
    if (moved) {
      if (cutPath() === path) setCutEntry(null);
      notifySuccess("Elemento movido", baseName(moved));
    }
  }

  async function rename(path: string): Promise<void> {
    const currentName = path.slice(path.lastIndexOf("/") + 1);
    const nextName = window.prompt("Nuevo nombre", currentName)?.trim();
    if (!nextName || nextName === currentName) return;
    const renamed = await renameEntry(path, nextName);
    if (renamed) {
      if (cutPath() === path) setCutEntry(null);
      notifySuccess("Elemento renombrado", baseName(renamed));
    }
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
      if (deleted) {
        if (cutPath() === path) setCutEntry(null);
        notifySuccess("Elemento eliminado", name);
      }
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
    cutPath,
    copyMarkdown,
    cut,
    paste,
    move,
    rename,
    remove,
  };
}
