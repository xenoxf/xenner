import { invoke } from "@tauri-apps/api/core";

import type {
  AssetPayload,
  CreateNoteResult,
  CreatedEntry,
  ImportedAsset,
  ImportedAttachment,
  NoteDocument,
  WorkspaceGateway,
  WorkspaceScan,
  WriteAcknowledgement,
} from "../../types/workspace";
import { asVaultError } from "./errors";

async function invokeWorkspace<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw asVaultError(error);
  }
}

export class TauriWorkspaceGateway implements WorkspaceGateway {
  readonly canChooseWorkspace = true;
  readonly canChooseImageAsset = true;
  readonly canChooseAttachment = true;

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

  importAttachment(
    notePath: string,
    fileName: string,
    dataBase64: string,
  ): Promise<ImportedAttachment> {
    return invokeWorkspace("import_attachment", { notePath, fileName, dataBase64 });
  }

  chooseAttachment(notePath: string): Promise<ImportedAttachment | null> {
    return invokeWorkspace("choose_attachment", { notePath });
  }

  readAsset(notePath: string, assetPath: string): Promise<AssetPayload> {
    return invokeWorkspace("read_asset", { notePath, assetPath });
  }

  updateAsset(
    notePath: string,
    assetPath: string,
    dataBase64: string,
    expectedRevision?: string,
  ): Promise<AssetPayload> {
    return invokeWorkspace("update_asset", {
      notePath,
      assetPath,
      dataBase64,
      expectedRevision: expectedRevision ?? null,
    });
  }

  deleteAsset(notePath: string, assetPath: string): Promise<void> {
    return invokeWorkspace("delete_asset", { notePath, assetPath });
  }

  writeNote(
    relativePath: string,
    body: string,
    expectedRevision: string,
  ): Promise<WriteAcknowledgement> {
    return invokeWorkspace("write_note", { relativePath, body, expectedRevision });
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

  moveEntry(relativePath: string, targetParent: string): Promise<string> {
    return invokeWorkspace("move_entry", { relativePath, targetParent });
  }

  async deleteEntry(relativePath: string): Promise<void> {
    await invokeWorkspace("delete_entry", { relativePath });
  }

  async openEntry(relativePath: string): Promise<boolean> {
    await invokeWorkspace("open_entry", { relativePath });
    return true;
  }

  async revealEntry(relativePath: string): Promise<boolean> {
    await invokeWorkspace("reveal_entry", { relativePath });
    return true;
  }
}
