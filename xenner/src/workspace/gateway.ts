import { invoke, isTauri } from "@tauri-apps/api/core";

import { joinPath, parentPath, replacePathName } from "./tree";
import { serializeNoteContent, splitNoteContent } from "./note";
import type {
  CreateNoteResult,
  CreatedEntry,
  NoteDocument,
  ImportedAsset,
  AssetPayload,
  VaultEntry,
  VaultErrorShape,
  WorkspaceScan,
  WriteAcknowledgement,
} from "./types";

export interface WorkspaceGateway {
  readonly canChooseWorkspace: boolean;
  readonly canChooseImageAsset: boolean;
  scan(): Promise<WorkspaceScan>;
  chooseWorkspace(): Promise<WorkspaceScan | null>;
  readNote(relativePath: string): Promise<NoteDocument>;
  importAsset(notePath: string, fileName: string, dataBase64: string): Promise<ImportedAsset>;
  chooseImageAsset(notePath: string): Promise<ImportedAsset | null>;
  readAsset(notePath: string, assetPath: string): Promise<AssetPayload>;
  updateAsset(notePath: string, assetPath: string, dataBase64: string): Promise<AssetPayload>;
  writeNote(
    relativePath: string,
    title: string,
    body: string,
    expectedRevision: string,
  ): Promise<WriteAcknowledgement>;
  createNote(parent: string, name?: string): Promise<CreateNoteResult>;
  createFolder(parent: string, name: string): Promise<CreatedEntry>;
  renameEntry(relativePath: string, name: string): Promise<string>;
  deleteEntry(relativePath: string): Promise<void>;
}

const PREVIEW_STORAGE_KEY = "xenner:workspace:preview:v1";
const MAX_PREVIEW_NOTE_LENGTH = 2_000_000;
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function vaultError(code: string, message: string): VaultErrorShape {
  return { code, message };
}

function asVaultError(value: unknown): VaultErrorShape {
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return { code: candidate.code, message: candidate.message };
    }
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed !== value) return asVaultError(parsed);
    } catch {
      // Tauri puede rechazar con texto plano; se muestra tal cual.
    }
    return vaultError("unknown", value);
  }
  return vaultError("unknown", "Error desconocido del sistema de archivos");
}

async function invokeWorkspace<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw asVaultError(error);
  }
}

class TauriWorkspaceGateway implements WorkspaceGateway {
  readonly canChooseWorkspace = true;
  readonly canChooseImageAsset = true;

  scan(): Promise<WorkspaceScan> {
    return invokeWorkspace("scan_workspace");
  }

  chooseWorkspace(): Promise<WorkspaceScan | null> {
    return invokeWorkspace("choose_workspace");
  }

  readNote(relativePath: string): Promise<NoteDocument> {
    return invokeWorkspace("read_note", { relativePath });
  }

  importAsset(notePath: string, fileName: string, dataBase64: string): Promise<ImportedAsset> {
    return invokeWorkspace("import_asset", { notePath, fileName, dataBase64 });
  }

  chooseImageAsset(notePath: string): Promise<ImportedAsset | null> {
    return invokeWorkspace("choose_image_asset", { notePath });
  }

  readAsset(notePath: string, assetPath: string): Promise<AssetPayload> {
    return invokeWorkspace("read_asset", { notePath, assetPath });
  }

  updateAsset(notePath: string, assetPath: string, dataBase64: string): Promise<AssetPayload> {
    return invokeWorkspace("update_asset", { notePath, assetPath, dataBase64 });
  }

  writeNote(
    relativePath: string,
    title: string,
    body: string,
    expectedRevision: string,
  ): Promise<WriteAcknowledgement> {
    return invokeWorkspace("write_note", { relativePath, title, body, expectedRevision });
  }

  createNote(parent: string, name?: string): Promise<CreateNoteResult> {
    return invokeWorkspace("create_note", { parent, name: name ?? null });
  }

  createFolder(parent: string, name: string): Promise<CreatedEntry> {
    return invokeWorkspace("create_folder", { parent, name });
  }

  renameEntry(relativePath: string, name: string): Promise<string> {
    return invokeWorkspace("rename_entry", { relativePath, name });
  }

  async deleteEntry(relativePath: string): Promise<void> {
    await invokeWorkspace("delete_entry", { relativePath });
  }
}

interface PreviewDocument {
  content: string;
  revision: string;
  updatedAt: number;
}

interface PreviewState {
  version: 1;
  entries: VaultEntry[];
  documents: Record<string, PreviewDocument>;
  assets: Record<string, AssetPayload>;
}

let memoryState: PreviewState = { version: 1, entries: [], documents: {}, assets: {} };

function emptyPreviewState(): PreviewState {
  return { version: 1, entries: [], documents: {}, assets: {} };
}

function sanitizePreviewState(value: unknown): PreviewState {
  if (!value || typeof value !== "object") return emptyPreviewState();
  const candidate = value as Partial<PreviewState>;
  if (candidate.version !== 1 || !Array.isArray(candidate.entries)) {
    return emptyPreviewState();
  }
  const documents: Record<string, PreviewDocument> = {};
  if (candidate.documents && typeof candidate.documents === "object") {
    for (const [path, document] of Object.entries(candidate.documents)) {
      if (
        document &&
        typeof document.content === "string" &&
        typeof document.revision === "string" &&
        typeof document.updatedAt === "number"
      ) {
        documents[path] = {
          content: document.content,
          revision: document.revision,
          updatedAt: document.updatedAt,
        };
      }
    }
  }
  const paths = new Set<string>();
  const entries = candidate.entries.filter((entry): entry is VaultEntry => {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      typeof entry.name !== "string" ||
      (entry.kind !== "note" && entry.kind !== "directory") ||
      paths.has(entry.path)
    ) {
      return false;
    }
    paths.add(entry.path);
    return true;
  });
  return { version: 1, entries, documents, assets: candidate.assets ?? {} };
}

function readPreviewState(): PreviewState {
  if (typeof localStorage === "undefined") return memoryState;
  try {
    const raw = localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (!raw) return memoryState;
    memoryState = sanitizePreviewState(JSON.parse(raw) as unknown);
  } catch (error) {
    throw vaultError(
      "io",
      error instanceof Error ? error.message : "no se pudo leer la vista previa local",
    );
  }
  return memoryState;
}

function writePreviewState(state: PreviewState): void {
  memoryState = state;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    throw vaultError(
      "io",
      error instanceof Error ? error.message : "no se pudo guardar la vista previa local",
    );
  }
}

function previewRevision(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `preview-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assertSafeRelativePath(path: string, allowEmpty = false): void {
  if (allowEmpty && path === "") return;
  if (
    !path ||
    path.length > 1_024 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw vaultError("invalidPath", "La ruta de vista previa no es válida");
  }
}

function normalizedPreviewName(input: string, note: boolean): string {
  const trimmed = input.trim();
  if (
    !trimmed ||
    trimmed.length > 180 ||
    /[<>:"/\\|?*\u0000-\u001f]/u.test(trimmed) ||
    trimmed.endsWith(".") ||
    trimmed.endsWith(" ")
  ) {
    throw vaultError("invalidPath", "El nombre no es válido");
  }
  const name = note && !trimmed.toLocaleLowerCase("es").endsWith(".md") ? `${trimmed}.md` : trimmed;
  if (note && name.length <= 3) {
    throw vaultError("invalidPath", "La nota necesita un nombre");
  }
  return name;
}

function nextUntitledPreviewName(state: PreviewState, parent: string): string {
  for (let index = 1; index <= 100_000; index += 1) {
    const name = index === 1 ? "Sin título.md" : `Sin título ${index}.md`;
    const path = joinPath(parent, name);
    const exists = state.entries.some(
      (entry) => entry.path.toLocaleLowerCase("es") === path.toLocaleLowerCase("es"),
    );
    if (!exists) return name;
  }
  throw vaultError("alreadyExists", "No se pudo crear una nota sin título");
}

function previewEntry(state: PreviewState, path: string): VaultEntry {
  const entry = state.entries.find((candidate) => candidate.path === path);
  if (!entry) throw vaultError("notFound", "La entrada no existe en la vista previa");
  return entry;
}

function assertPreviewParent(state: PreviewState, parent: string): void {
  assertSafeRelativePath(parent, true);
  if (parent) previewEntry(state, parent);
}

function previewScan(state: PreviewState): WorkspaceScan {
  const entries = [...state.entries].sort((left, right) => collator.compare(left.path, right.path));
  return {
    info: {
      root: "Biblioteca de vista previa",
      noteCount: entries.filter((entry) => entry.kind === "note").length,
      entryCount: entries.length,
      truncated: false,
    },
    entries,
  };
}

class PreviewWorkspaceGateway implements WorkspaceGateway {
  readonly canChooseWorkspace = false;
  readonly canChooseImageAsset = false;

  async scan(): Promise<WorkspaceScan> {
    return previewScan(readPreviewState());
  }

  async chooseWorkspace(): Promise<null> {
    return null;
  }

  async readNote(relativePath: string): Promise<NoteDocument> {
    assertSafeRelativePath(relativePath);
    const state = readPreviewState();
    const entry = previewEntry(state, relativePath);
    if (entry.kind !== "note") throw vaultError("invalidPath", "La entrada no es una nota");
    const document = state.documents[relativePath];
    if (!document) throw vaultError("notFound", "No se encontró el contenido de la nota");
    const parts = splitNoteContent(relativePath, document.content);
    return {
      path: relativePath,
      title: parts.title,
      body: parts.body,
      revision: document.revision,
      updatedAt: document.updatedAt,
      size: new TextEncoder().encode(document.content).byteLength,
    };
  }

  async importAsset(notePath: string, fileName: string, dataBase64: string): Promise<ImportedAsset> {
    assertSafeRelativePath(notePath);
    const lower = fileName.toLocaleLowerCase("es");
    const extension = lower.endsWith(".svg")
      ? "svg"
      : lower.endsWith(".png")
        ? "png"
        : lower.endsWith(".gif")
          ? "gif"
          : lower.endsWith(".webp")
            ? "webp"
            : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
              ? "jpg"
              : null;
    if (!extension) throw vaultError("invalidPath", "Tipo de imagen no permitido");
    const mime = extension === "svg" ? "image/svg+xml" : `image/${extension}`;
    const state = readPreviewState();
    const relativePath = `./.assets/${previewRevision(dataBase64).slice(-16)}.${extension}`;
    state.assets[relativePath] = { mime, dataBase64 };
    writePreviewState(state);
    return { relativePath, mime, dataBase64, fileName };
  }

  async chooseImageAsset(): Promise<ImportedAsset | null> {
    return null;
  }

  async readAsset(notePath: string, assetPath: string): Promise<AssetPayload> {
    assertSafeRelativePath(notePath);
    const state = readPreviewState();
    const normalized = assetPath.startsWith("./") ? assetPath.slice(2) : assetPath;
    const asset = state.assets[`./${normalized}`] ?? state.assets[normalized];
    if (!asset) throw vaultError("notFound", "El asset no existe en la vista previa");
    return asset;
  }

  async updateAsset(notePath: string, assetPath: string, dataBase64: string): Promise<AssetPayload> {
    assertSafeRelativePath(notePath);
    const state = readPreviewState();
    const normalized = assetPath.startsWith("./") ? assetPath.slice(2) : assetPath;
    const key = state.assets[`./${normalized}`] ? `./${normalized}` : normalized;
    const current = state.assets[key];
    if (!current) throw vaultError("notFound", "El asset no existe en la vista previa");
    const extension = key.slice(key.lastIndexOf(".") + 1).toLocaleLowerCase("es");
    const mime = extension === "svg" ? "image/svg+xml" : `image/${extension}`;
    const next = { mime, dataBase64 };
    writePreviewState({ ...state, assets: { ...state.assets, [key]: next } });
    return next;
  }

  async writeNote(
    relativePath: string,
    title: string,
    body: string,
    expectedRevision: string,
  ): Promise<WriteAcknowledgement> {
    assertSafeRelativePath(relativePath);
    const content = serializeNoteContent(title, body);
    if (new TextEncoder().encode(content).byteLength > MAX_PREVIEW_NOTE_LENGTH) {
      throw vaultError("tooLarge", "La nota es demasiado grande");
    }
    const state = readPreviewState();
    previewEntry(state, relativePath);
    const current = state.documents[relativePath];
    if (!current || current.revision !== expectedRevision) {
      throw vaultError("conflict", "La nota cambió fuera de Xenner");
    }
    const updatedAt = Date.now();
    const revision = previewRevision(content);
    writePreviewState({
      ...state,
      entries: state.entries.map((candidate) =>
        candidate.path === relativePath
          ? { ...candidate, updatedAt, size: new TextEncoder().encode(content).byteLength }
          : candidate,
      ),
      documents: { ...state.documents, [relativePath]: { content, revision, updatedAt } },
    });
    return { path: relativePath, revision, updatedAt };
  }

  async createNote(parent: string, name?: string): Promise<CreateNoteResult> {
    assertSafeRelativePath(parent, true);
    const state = readPreviewState();
    assertPreviewParent(state, parent);
    const normalized = name === undefined
      ? nextUntitledPreviewName(state, parent)
      : normalizedPreviewName(name, true);
    const path = joinPath(parent, normalized);
    if (state.entries.some((entry) => entry.path.toLocaleLowerCase("es") === path.toLocaleLowerCase("es"))) {
      throw vaultError("alreadyExists", "Ya existe una nota con ese nombre");
    }
    const title = name === undefined ? "" : normalized.slice(0, -3);
    const content = serializeNoteContent(title, "");
    const updatedAt = Date.now();
    const revision = previewRevision(content);
    const entry: VaultEntry = {
      path,
      name: normalized,
      kind: "note",
      updatedAt,
      size: new TextEncoder().encode(content).byteLength,
    };
    writePreviewState({
      ...state,
      entries: [...state.entries, entry],
      documents: { ...state.documents, [path]: { content, revision, updatedAt } },
    });
    return {
      entry,
      document: {
        path,
        title,
        body: "",
        revision,
        updatedAt,
        size: entry.size ?? new TextEncoder().encode(content).byteLength,
      },
    };
  }

  async createFolder(parent: string, name: string): Promise<CreatedEntry> {
    assertSafeRelativePath(parent, true);
    const normalized = normalizedPreviewName(name, false);
    const state = readPreviewState();
    assertPreviewParent(state, parent);
    const path = joinPath(parent, normalized);
    if (state.entries.some((entry) => entry.path.toLocaleLowerCase("es") === path.toLocaleLowerCase("es"))) {
      throw vaultError("alreadyExists", "Ya existe una carpeta con ese nombre");
    }
    const entry: VaultEntry = {
      path,
      name: normalized,
      kind: "directory",
      updatedAt: Date.now(),
      size: null,
    };
    writePreviewState({ ...state, entries: [...state.entries, entry] });
    return { path, name: normalized, kind: "directory" };
  }

  async renameEntry(relativePath: string, name: string): Promise<string> {
    assertSafeRelativePath(relativePath);
    const state = readPreviewState();
    const entry = previewEntry(state, relativePath);
    const normalized = normalizedPreviewName(name, entry.kind === "note");
    const nextPath = replacePathName(relativePath, normalized);
    if (
      state.entries.some(
        (candidate) =>
          candidate.path !== relativePath &&
          candidate.path.toLocaleLowerCase("es") === nextPath.toLocaleLowerCase("es"),
      )
    ) {
      throw vaultError("alreadyExists", "Ya existe una entrada con ese nombre");
    }

    const documents = { ...state.documents };
    if (entry.kind === "note" && documents[relativePath]) {
      documents[nextPath] = documents[relativePath];
      delete documents[relativePath];
    }
    writePreviewState({
      ...state,
      documents,
      entries: state.entries.map((candidate) => {
        if (candidate.path === relativePath) {
          return { ...candidate, path: nextPath, name: normalized, updatedAt: Date.now() };
        }
        if (candidate.path.startsWith(`${relativePath}/`)) {
          const suffix = candidate.path.slice(relativePath.length);
          return { ...candidate, path: `${nextPath}${suffix}` };
        }
        return candidate;
      }),
    });
    return nextPath;
  }

  async deleteEntry(relativePath: string): Promise<void> {
    assertSafeRelativePath(relativePath);
    const state = readPreviewState();
    const entry = previewEntry(state, relativePath);
    const descendants = state.entries.filter((candidate) =>
      candidate.path.startsWith(`${relativePath}/`),
    );
    if (entry.kind === "directory" && descendants.length > 0) {
      throw vaultError("notEmpty", "La carpeta no está vacía");
    }
    const documents = { ...state.documents };
    delete documents[relativePath];
    writePreviewState({
      ...state,
      documents,
      entries: state.entries.filter((candidate) => candidate.path !== relativePath),
    });
  }
}

const gateway = isTauri() ? new TauriWorkspaceGateway() : new PreviewWorkspaceGateway();

export function getWorkspaceGateway(): WorkspaceGateway {
  return gateway;
}

export function isPathChildOf(candidate: string, parent: string): boolean {
  return candidate !== parent && candidate.startsWith(`${parent}/`);
}

export function previewParentPath(path: string): string {
  return parentPath(path);
}
