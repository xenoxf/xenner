export type EntryKind = "directory" | "note";
export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error" | "conflict";

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

export interface WorkspaceTreeNode extends VaultEntry {
  children: WorkspaceTreeNode[];
}

export interface NoteDocument {
  path: string;
  /** Nombre del archivo sin la extensión técnica `.md`. */
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
  revision: string;
  fileName: string;
}

export interface AssetPayload {
  mime: string;
  dataBase64: string;
  revision: string;
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

export interface WorkspaceGateway {
  readonly canChooseWorkspace: boolean;
  readonly canChooseImageAsset: boolean;
  scan(): Promise<WorkspaceScan>;
  chooseWorkspace(): Promise<WorkspaceScan | null>;
  readNote(relativePath: string): Promise<NoteDocument>;
  importAsset(notePath: string, fileName: string, dataBase64: string): Promise<ImportedAsset>;
  chooseImageAsset(notePath: string): Promise<ImportedAsset | null>;
  readAsset(notePath: string, assetPath: string): Promise<AssetPayload>;
  updateAsset(
    notePath: string,
    assetPath: string,
    dataBase64: string,
    expectedRevision?: string,
  ): Promise<AssetPayload>;
  deleteAsset(notePath: string, assetPath: string): Promise<void>;
  /** El título se deriva de `relativePath`; el gateway solo recibe el cuerpo. */
  writeNote(
    relativePath: string,
    body: string,
    expectedRevision: string,
  ): Promise<WriteAcknowledgement>;
  createNote(parent: string, name?: string): Promise<CreateNoteResult>;
  createFolder(parent: string, name: string): Promise<CreatedEntry>;
  renameEntry(relativePath: string, name: string): Promise<string>;
  moveEntry(relativePath: string, targetParent: string): Promise<string>;
  deleteEntry(relativePath: string): Promise<void>;
}
