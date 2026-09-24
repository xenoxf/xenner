import { createMemo, createSignal } from "solid-js";

import { getWorkspaceGateway } from "./gateway";
import { buildWorkspaceTree, isPathInside } from "./tree";
import type { Note } from "../notes/model";
import type {
  CreatedEntry,
  NoteDocument,
  SaveStatus,
  VaultErrorShape,
  WorkspaceScan,
} from "./types";

const SAVE_DELAY_MS = 300;

interface PendingSave {
  path: string;
  content: string;
  revision: string;
}

const gateway = getWorkspaceGateway();

const [workspace, setWorkspace] = createSignal<WorkspaceScan | null>(null);
const [selectedPath, setSelectedPath] = createSignal<string | null>(null);
const [selectedDocument, setSelectedDocument] = createSignal<NoteDocument | null>(null);
const [saveStatus, setSaveStatus] = createSignal<SaveStatus>("clean");
const [workspaceLoading, setWorkspaceLoading] = createSignal(true);
const [documentLoading, setDocumentLoading] = createSignal(false);
const [documentReloadToken, setDocumentReloadToken] = createSignal(0);
const [workspaceError, setWorkspaceError] = createSignal<VaultErrorShape | null>(null);
const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set());

const tree = createMemo(() => buildWorkspaceTree(workspace()?.entries ?? []));
let pendingSave: PendingSave | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight: Promise<boolean> | null = null;
let selectionRequest = 0;
let initialization: Promise<void> | null = null;

function errorMessage(error: unknown): VaultErrorShape {
  if (error && typeof error === "object") {
    const candidate = error as Partial<VaultErrorShape>;
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return { code: candidate.code, message: candidate.message };
    }
  }
  return {
    code: "unknown",
    message: error instanceof Error ? error.message : "Error desconocido",
  };
}

function clearSaveTimer(): void {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
}

function setExpanded(path: string, expanded: boolean): void {
  setExpandedPaths((previous) => {
    const next = new Set(previous);
    if (expanded) next.add(path);
    else next.delete(path);
    return next;
  });
}

async function refreshWorkspace(): Promise<WorkspaceScan> {
  const scan = await gateway.scan();
  setWorkspace(scan);
  setWorkspaceError(null);
  return scan;
}

async function persist(item: PendingSave): Promise<boolean> {
  setSaveStatus("saving");
  setWorkspaceError(null);
  try {
    const acknowledgement = await gateway.writeNote(item.path, item.content, item.revision);
    setSelectedDocument((current) => {
      if (!current || current.path !== acknowledgement.path) return current;
      return {
        ...current,
        content: current.content === item.content ? item.content : current.content,
        revision: acknowledgement.revision,
        updatedAt: acknowledgement.updatedAt,
        size: new TextEncoder().encode(current.content).byteLength,
      };
    });
    if (pendingSave?.path === acknowledgement.path) {
      pendingSave = { ...pendingSave, revision: acknowledgement.revision };
    }
    setSaveStatus(pendingSave ? "dirty" : "saved");
    return true;
  } catch (error) {
    const normalized = errorMessage(error);
    if (!pendingSave) pendingSave = item;
    setSaveStatus(normalized.code === "conflict" ? "conflict" : "error");
    setWorkspaceError(normalized);
    return false;
  }
}

async function runSaveLoop(): Promise<boolean> {
  if (saveInFlight) await saveInFlight;
  let successful = true;
  while (pendingSave) {
    const item = pendingSave;
    pendingSave = null;
    saveInFlight = persist(item);
    const result = await saveInFlight;
    saveInFlight = null;
    successful = successful && result;
    if (!result) break;
  }
  return successful;
}

export async function flushPendingSave(): Promise<boolean> {
  clearSaveTimer();
  if (!pendingSave && !saveInFlight) return true;
  return runSaveLoop();
}

function scheduleSave(path: string, content: string, revision: string): void {
  if (selectedPath() !== path) return;
  pendingSave = { path, content, revision };
  setSaveStatus("dirty");
  clearSaveTimer();
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void runSaveLoop();
  }, SAVE_DELAY_MS);
}

export function getWorkspace() {
  return workspace();
}

export function getWorkspaceTree() {
  return tree();
}

export function getSelectedPath() {
  return selectedPath();
}

export function getSelectedDocument() {
  return selectedDocument();
}

export function getSaveStatus() {
  return saveStatus();
}

export function getWorkspaceLoading() {
  return workspaceLoading();
}

export function getDocumentLoading() {
  return documentLoading();
}

export function getDocumentReloadToken() {
  return documentReloadToken();
}

export function getWorkspaceError() {
  return workspaceError();
}

export function getExpandedPaths() {
  return expandedPaths();
}

export function workspaceSupportsFolderPicker(): boolean {
  return gateway.canChooseWorkspace;
}

export function toggleFolder(path: string): void {
  setExpanded(path, !expandedPaths().has(path));
}

export function expandFolder(path: string): void {
  setExpanded(path, true);
}

export function initializeWorkspace(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    setWorkspaceLoading(true);
    try {
      const scan = await refreshWorkspace();
      const firstNote = scan.entries.find((entry) => entry.kind === "note");
      if (firstNote) await selectNote(firstNote.path);
    } catch (error) {
      setWorkspaceError(errorMessage(error));
    } finally {
      setWorkspaceLoading(false);
    }
  })();
  return initialization;
}

export async function selectNote(path: string): Promise<boolean> {
  const currentPath = selectedPath();
  if (currentPath === path && selectedDocument()) return true;
  if (currentPath && !(await flushPendingSave())) return false;

  const request = ++selectionRequest;
  setDocumentLoading(true);
  setWorkspaceError(null);
  try {
    const document = await gateway.readNote(path);
    if (request !== selectionRequest) return false;
    setSelectedPath(path);
    setSelectedDocument(document);
    setSaveStatus("clean");
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (parent) expandFolder(parent);
    return true;
  } catch (error) {
    if (request === selectionRequest) setWorkspaceError(errorMessage(error));
    return false;
  } finally {
    if (request === selectionRequest) setDocumentLoading(false);
  }
}

export function updateSelectedDocument(content: string): void {
  const current = selectedDocument();
  const path = selectedPath();
  if (!current || !path) return;
  setSelectedDocument({
    ...current,
    content,
    size: new TextEncoder().encode(content).byteLength,
  });
  scheduleSave(path, content, current.revision);
}

export async function retryPendingSave(): Promise<boolean> {
  return runSaveLoop();
}

export async function reloadSelectedDocument(): Promise<boolean> {
  const path = selectedPath();
  if (!path) return false;
  const request = ++selectionRequest;
  clearSaveTimer();
  pendingSave = null;
  setDocumentLoading(true);
  try {
    const document = await gateway.readNote(path);
    if (request !== selectionRequest) return false;
    setSelectedDocument(document);
    setDocumentReloadToken((token) => token + 1);
    setSaveStatus("clean");
    setWorkspaceError(null);
    return true;
  } catch (error) {
    setWorkspaceError(errorMessage(error));
    return false;
  } finally {
    if (request === selectionRequest) setDocumentLoading(false);
  }
}

export async function createNote(parent: string, name: string): Promise<string | null> {
  if (!(await flushPendingSave())) return null;
  try {
    const result = await gateway.createNote(parent, name);
    await refreshWorkspace();
    if (parent) expandFolder(parent);
    await selectNote(result.entry.path);
    return result.entry.path;
  } catch (error) {
    setWorkspaceError(errorMessage(error));
    return null;
  }
}

export async function createFolder(parent: string, name: string): Promise<CreatedEntry | null> {
  if (!(await flushPendingSave())) return null;
  try {
    const created = await gateway.createFolder(parent, name);
    await refreshWorkspace();
    if (parent) expandFolder(parent);
    expandFolder(created.path);
    setWorkspaceError(null);
    return created;
  } catch (error) {
    setWorkspaceError(errorMessage(error));
    return null;
  }
}

function legacySlug(title: string, id: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return `${base || "nota"}--${id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 8) || "legacy"}`;
}

export async function importLegacyNotes(notes: Note[]): Promise<number> {
  if (!notes.length) return 0;
  const root = workspace()?.info.root;
  if (!root) return 0;
  const markerKey = "xenner:legacy-import:v1";
  let importedIds = new Set<string>();
  try {
    const raw = localStorage.getItem(markerKey);
    const parsed = raw ? (JSON.parse(raw) as { root?: string; ids?: string[] }) : null;
    if (parsed?.root === root && Array.isArray(parsed.ids)) importedIds = new Set(parsed.ids);
  } catch {
    importedIds = new Set();
  }

  const currentEntries = workspace()?.entries ?? [];
  let parent = currentEntries.some((entry) => entry.path === "Importadas" && entry.kind === "directory")
    ? "Importadas"
    : "";
  if (!parent) {
    try {
      const folder = await gateway.createFolder("", "Importadas");
      parent = folder.path;
      await refreshWorkspace();
    } catch (error) {
      setWorkspaceError(errorMessage(error));
      return 0;
    }
  }

  let imported = 0;
  for (const note of notes) {
    if (importedIds.has(note.id)) continue;
    const name = `${legacySlug(note.title, note.id)}.md`;
    try {
      const result = await gateway.createNote(parent, name);
      await gateway.writeNote(result.entry.path, note.body, result.document.revision);
      importedIds.add(note.id);
      imported += 1;
    } catch (error) {
      if (error && typeof error === "object" && (error as { code?: string }).code === "alreadyExists") {
        const retryName = `${legacySlug(note.title, note.id)}-${Date.now().toString(36)}.md`;
        try {
          const result = await gateway.createNote(parent, retryName);
          await gateway.writeNote(result.entry.path, note.body, result.document.revision);
          importedIds.add(note.id);
          imported += 1;
        } catch (retryError) {
          setWorkspaceError(errorMessage(retryError));
        }
      } else {
        setWorkspaceError(errorMessage(error));
      }
    }
  }
  await refreshWorkspace();
  try {
    localStorage.setItem(markerKey, JSON.stringify({ root, ids: [...importedIds] }));
  } catch {
    // La importación ya terminó; los archivos son la fuente de verdad.
  }
  return imported;
}

export async function renameEntry(path: string, name: string): Promise<string | null> {
  if (!(await flushPendingSave())) return null;
  const previousSelection = selectedPath();
  try {
    const nextPath = await gateway.renameEntry(path, name);
    await refreshWorkspace();
    if (previousSelection === path || (previousSelection && isPathInside(previousSelection, path))) {
      const suffix = previousSelection.slice(path.length);
      await selectNote(`${nextPath}${suffix}`);
    }
    setWorkspaceError(null);
    return nextPath;
  } catch (error) {
    setWorkspaceError(errorMessage(error));
    return null;
  }
}

export async function deleteEntry(path: string): Promise<boolean> {
  if (!(await flushPendingSave())) return false;
  const previousSelection = selectedPath();
  const flatEntries = workspace()?.entries ?? [];
  const index = flatEntries.findIndex((entry) => entry.path === path);
  try {
    await gateway.deleteEntry(path);
    await refreshWorkspace();
    if (previousSelection === path || (previousSelection && isPathInside(previousSelection, path))) {
      const next = [
        ...flatEntries.slice(index + 1),
        ...flatEntries.slice(0, Math.max(index, 0)),
      ].find((entry) => entry.kind === "note")?.path;
      if (next) await selectNote(next);
      else {
        selectionRequest += 1;
        setSelectedPath(null);
        setSelectedDocument(null);
        setSaveStatus("clean");
      }
    }
    setWorkspaceError(null);
    return true;
  } catch (error) {
    setWorkspaceError(errorMessage(error));
    return false;
  }
}

export async function chooseWorkspace(): Promise<boolean> {
  if (!(await flushPendingSave())) return false;
  try {
    const scan = await gateway.chooseWorkspace();
    if (!scan) return false;
    selectionRequest += 1;
    pendingSave = null;
    setWorkspace(scan);
    setSelectedPath(null);
    setSelectedDocument(null);
    setSaveStatus("clean");
    setExpandedPaths(new Set<string>());
    setWorkspaceError(null);
    const firstNote = scan.entries.find((entry) => entry.kind === "note");
    if (firstNote) await selectNote(firstNote.path);
    return true;
  } catch (error) {
    if (gateway.canChooseWorkspace) setWorkspaceError(errorMessage(error));
    return false;
  }
}

export async function refreshWorkspaceTree(): Promise<boolean> {
  if (!(await flushPendingSave())) return false;
  try {
    await refreshWorkspace();
    return true;
  } catch (error) {
    setWorkspaceError(errorMessage(error));
    return false;
  }
}

export function closeWorkspaceError(): void {
  setWorkspaceError(null);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    void flushPendingSave();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushPendingSave();
  });
}
