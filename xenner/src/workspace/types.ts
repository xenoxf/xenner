export type EntryKind = "directory" | "note";

export interface VaultEntry {
  path: string;
  name: string;
  kind: EntryKind;
  updatedAt: number | null;
  size: number | null;
}

export interface VaultInfo {
  root: string;
  noteCount: number;
  entryCount: number;
  truncated: boolean;
}

export interface WorkspaceScan {
  info: VaultInfo;
  entries: VaultEntry[];
}

export interface NoteDocument {
  path: string;
  title: string;
  body: string;
  revision: string;
  updatedAt: number;
  size: number;
}

export interface ImportedAsset {
  relativePath: string;
  mime: string;
  dataBase64: string;
  fileName: string;
}

export interface AssetPayload {
  mime: string;
  dataBase64: string;
}

export interface WriteAcknowledgement {
  path: string;
  revision: string;
  updatedAt: number;
}

export interface CreatedEntry {
  path: string;
  name: string;
  kind: EntryKind;
}

export interface CreateNoteResult {
  entry: CreatedEntry;
  document: NoteDocument;
}

export interface VaultErrorShape {
  code: string;
  message: string;
}

export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error" | "conflict";
