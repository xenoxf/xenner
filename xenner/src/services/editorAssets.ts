import { resolveAssetReference } from "../editor/asset-paths";
import type {
  ImportedEditorAsset,
  PreparedMarkdown,
} from "../types/editor";
import type { AssetPayload, ImportedAsset } from "../types/workspace";
import { getWorkspaceGateway } from "./workspace/gateway";

export { resolveAssetReference } from "../editor/asset-paths";

const IMAGE_MARKDOWN = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+["'][^)]*["'])?\))/g;

function dataUrl(payload: AssetPayload): string {
  return `data:${payload.mime};base64,${payload.dataBase64}`;
}

export async function prepareMarkdownForEditor(
  notePath: string,
  markdown: string,
): Promise<PreparedMarkdown> {
  const sources = new Set<string>();
  for (const match of markdown.matchAll(IMAGE_MARKDOWN)) {
    const source = match[2];
    if (resolveAssetReference(notePath, source)) sources.add(source);
  }

  const loaded = new Map<string, { dataUrl: string; revision: string }>();
  await Promise.all(
    [...sources].map(async (source) => {
      const assetPath = resolveAssetReference(notePath, source);
      if (!assetPath) return;
      try {
        const payload = await getWorkspaceGateway().readAsset(notePath, assetPath);
        loaded.set(source, { dataUrl: dataUrl(payload), revision: payload.revision });
      } catch {
        // Un asset roto no impide abrir el Markdown; se conserva la referencia.
      }
    }),
  );

  const replacements = new Map<string, string>();
  const revisions = new Map<string, string>();
  let content = markdown.replace(IMAGE_MARKDOWN, (full, prefix, source, suffix) => {
    const asset = loaded.get(source);
    if (!asset) return full;
    replacements.set(asset.dataUrl, source);
    revisions.set(asset.dataUrl, asset.revision);
    return `${prefix}${asset.dataUrl}${suffix}`;
  });
  return { content, replacements, revisions };
}

export function serializeMarkdownFromEditor(
  markdown: string,
  replacements: ReadonlyMap<string, string>,
): string {
  let serialized = markdown;
  for (const [displayUrl, source] of [...replacements.entries()].sort((left, right) => right[0].length - left[0].length)) {
    serialized = serialized.split(displayUrl).join(source);
  }
  return serialized;
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToText(dataBase64: string): string {
  const binary = atob(dataBase64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function readAssetForEditor(notePath: string, relativePath: string): Promise<string> {
  const payload = await getWorkspaceGateway().readAsset(notePath, relativePath);
  return base64ToText(payload.dataBase64);
}

export async function updateAssetForEditor(
  notePath: string,
  relativePath: string,
  file: File,
  expectedRevision?: string,
): Promise<ImportedEditorAsset> {
  const dataBase64 = await fileToBase64(file);
  const updated = await getWorkspaceGateway().updateAsset(
    notePath,
    relativePath,
    dataBase64,
    expectedRevision,
  );
  return {
    dataUrl: `data:${updated.mime};base64,${updated.dataBase64}`,
    relativePath,
    revision: updated.revision,
  };
}

export async function deleteAssetForEditor(notePath: string, relativePath: string): Promise<void> {
  await getWorkspaceGateway().deleteAsset(notePath, relativePath);
}

export function editorSupportsNativeImagePicker(): boolean {
  return getWorkspaceGateway().canChooseImageAsset;
}

export async function chooseImageForEditor(notePath: string): Promise<ImportedEditorAsset | null> {
  const imported = await getWorkspaceGateway().chooseImageAsset(notePath);
  if (!imported) return null;
  return {
    dataUrl: `data:${imported.mime};base64,${imported.dataBase64}`,
    relativePath: imported.relativePath,
    revision: imported.revision,
    fileName: imported.fileName,
  };
}

export async function importImageForEditor(
  notePath: string,
  file: File,
): Promise<ImportedEditorAsset> {
  const dataBase64 = await fileToBase64(file);
  const imported: ImportedAsset = await getWorkspaceGateway().importAsset(
    notePath,
    file.name,
    dataBase64,
  );
  return {
    dataUrl: `data:${imported.mime};base64,${imported.dataBase64}`,
    relativePath: imported.relativePath,
    revision: imported.revision,
    fileName: imported.fileName,
  };
}
