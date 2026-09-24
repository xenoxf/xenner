import type {
  AssetPayload,
  VaultEntry,
  WorkspaceScan,
} from "../../types/workspace";
import { joinPath } from "../../workspace/tree";
import { vaultError } from "./errors";

const PREVIEW_STORAGE_KEY = "xenner:workspace:preview:v1";
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export const MAX_PREVIEW_NOTE_LENGTH = 2_000_000;

export interface PreviewDocument {
  content: string;
  revision: string;
  updatedAt: number;
}

export interface PreviewState {
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

export function readPreviewState(): PreviewState {
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

export function writePreviewState(state: PreviewState): void {
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

export function previewRevision(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `preview-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function assertSafeRelativePath(path: string, allowEmpty = false): void {
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

export function normalizedPreviewName(input: string, note: boolean): string {
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

export function nextUntitledPreviewName(state: PreviewState, parent: string): string {
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

export function previewEntry(state: PreviewState, path: string): VaultEntry {
  const entry = state.entries.find((candidate) => candidate.path === path);
  if (!entry) throw vaultError("notFound", "La entrada no existe en la vista previa");
  return entry;
}

export function assertPreviewParent(state: PreviewState, parent: string): void {
  assertSafeRelativePath(parent, true);
  if (parent) previewEntry(state, parent);
}

export function previewScan(state: PreviewState): WorkspaceScan {
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
