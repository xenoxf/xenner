import type {
  AssetPayload,
  CreateNoteResult,
  CreatedEntry,
  ImportedAsset,
  NoteDocument,
  VaultEntry,
  WorkspaceGateway,
  WorkspaceScan,
  WriteAcknowledgement,
} from "../../types/workspace";
import { joinPath, replacePathName } from "../../workspace/tree";
import { serializeNoteContent, splitNoteContent } from "../../workspace/note";
import { vaultError } from "./errors";
import {
  assertPreviewParent,
  assertSafeRelativePath,
  MAX_PREVIEW_NOTE_LENGTH,
  nextUntitledPreviewName,
  normalizedPreviewName,
  previewEntry,
  previewRevision,
  previewScan,
  readPreviewState,
  writePreviewState,
} from "./previewState";

export class PreviewWorkspaceGateway implements WorkspaceGateway {
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
    const revision = previewRevision(dataBase64);
    state.assets[relativePath] = { mime, dataBase64, revision };
    writePreviewState(state);
    return { relativePath, mime, dataBase64, revision, fileName };
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
    return { ...asset, revision: asset.revision ?? previewRevision(asset.dataBase64) };
  }

  async updateAsset(
    notePath: string,
    assetPath: string,
    dataBase64: string,
    expectedRevision?: string,
  ): Promise<AssetPayload> {
    assertSafeRelativePath(notePath);
    const state = readPreviewState();
    const normalized = assetPath.startsWith("./") ? assetPath.slice(2) : assetPath;
    const key = state.assets[`./${normalized}`] ? `./${normalized}` : normalized;
    const current = state.assets[key];
    if (!current) throw vaultError("notFound", "El asset no existe en la vista previa");
    const currentRevision = current.revision ?? previewRevision(current.dataBase64);
    if (expectedRevision && currentRevision !== expectedRevision) {
      throw vaultError("conflict", "El asset cambió fuera de Xenner");
    }
    const extension = key.slice(key.lastIndexOf(".") + 1).toLocaleLowerCase("es");
    const mime = extension === "svg" ? "image/svg+xml" : `image/${extension}`;
    const revision = previewRevision(dataBase64);
    const next = { mime, dataBase64, revision };
    writePreviewState({ ...state, assets: { ...state.assets, [key]: next } });
    return next;
  }

  async deleteAsset(notePath: string, assetPath: string): Promise<void> {
    assertSafeRelativePath(notePath);
    const state = readPreviewState();
    const normalized = assetPath.startsWith("./") ? assetPath.slice(2) : assetPath;
    const key = state.assets[`./${normalized}`] ? `./${normalized}` : normalized;
    if (!state.assets[key]) return;
    const assets = { ...state.assets };
    delete assets[key];
    writePreviewState({ ...state, assets });
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
