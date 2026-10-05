import { createSignal } from "solid-js";

import { notifyError, notifySuccess } from "../services/toastService";
import { confirmDialog, promptDialog } from "../services/dialogs";
import { saveActiveWhiteboard } from "../services/editorSession";
import { getWorkspaceGateway } from "../services/workspace/gateway";
import { readLegacyNotes } from "../services/legacyNotes";
import type { LegacyNote } from "../types/legacy";
import { baseName } from "../utils/paths";
import { serializeNoteContent } from "../workspace/note";
import {
  createFolder,
  createNote,
  creationParent,
  deleteEntry,
  expandFolder,
  flushPendingSave,
  focusEntry,
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
  /**
   * La ruta de la última carpeta creada, o `null`.
   *
   * La vista de móvil la necesita porque no puede deducirla del árbol: al crear
   * una carpeta, el watcher de la biblioteca sondea cada 2,5 segundos y puede
   * traer en el mismo breath una carpeta sincronizada de otra máquina. Comparar
   * las carpetas de antes con las de después elegía la queFAULTara primero por
   * orden alfabético, que no era necesariamente la propia.
   */
  const [createdPath, setCreatedPath] = createSignal<string | null>(null);

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

  /**
 * Empieza a crear algo, y dice **dónde** cae.
 *
 * Sin destino —que es lo que hacen los botones de la barra y el botón de «una
 * nota para escribir»— se usa la carpeta enfocada, como en cualquier explorador
 * de un solo clic: si elegiste una carpeta y la dejaste elegida, lo nuevo cae
 * dentro de ella. El menú contextual, en cambio, siempre pasa su destino: «Nueva
 * nota» sobre una carpeta es esa carpeta, aunque lo enfocado sea otra cosa.
 */
function startCreation(kind: CreationKind, parent?: string): void {
    const destino = parent ?? creationParent();
    if (destino) expandFolder(destino);
    if (kind === "note") {
      void createUntitledNote(destino);
      return;
    }
    setCreation({ kind, parent: destino });
  }

  async function submitCreation(name: string): Promise<void> {
    const draft = creation();
    if (!draft || creating()) return;
    setCreating(true);
    try {
      const result = await createFolder(draft.parent, name);
      if (result) {
        setCreation(null);
        setCreatedPath(result.path);
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
    const confirmed = await confirmDialog({
      title: "Importar notas antiguas",
      message:
        `Se importarán ${notes.length} notas antiguas a la carpeta Importadas. ` +
        `La copia local original se conserva.`,
      confirmLabel: "Importar",
    });
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
    // Lo cortado sigue enfocado: quien lo cortó lo quiere mover, y así el
    // elemento se ve de dónde salió mientras está esperando el pegado.
    focusEntry(path);
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
    const nextName = await promptDialog({
      title: "Renombrar",
      label: "Nombre nuevo",
      value: currentName,
    });
    if (!nextName || nextName === currentName) return;
    const renamed = await renameEntry(path, nextName);
    if (renamed) {
      if (cutPath() === path) setCutEntry(null);
      notifySuccess("Elemento renombrado", baseName(renamed));
    }
  }

  async function remove(path: string): Promise<void> {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const isNote = path.toLocaleLowerCase("es").endsWith(".md");
    const confirmed = await confirmDialog({
      title: isNote ? `¿Eliminar “${name}”?` : `¿Eliminar la carpeta “${name}”?`,
      message: isNote
        ? "Esta acción no se puede deshacer."
        : "Solo se puede eliminar si está vacía.",
      confirmLabel: "Eliminar",
      danger: true,
    });
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
    createdPath,
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
