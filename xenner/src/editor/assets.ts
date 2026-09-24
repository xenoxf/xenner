import { getWorkspaceGateway } from "../workspace/gateway";
import type { AssetPayload, ImportedAsset } from "../workspace/types";

export interface PreparedMarkdown {
  content: string;
  replacements: Map<string, string>;
}

export interface ImportedEditorAsset {
  dataUrl: string;
  relativePath: string;
}

import { resolveAssetReference } from "./asset-paths";

export { resolveAssetReference } from "./asset-paths";

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

  const loaded = new Map<string, string>();
  await Promise.all(
    [...sources].map(async (source) => {
      const assetPath = resolveAssetReference(notePath, source);
      if (!assetPath) return;
      try {
        loaded.set(source, dataUrl(await getWorkspaceGateway().readAsset(notePath, assetPath)));
      } catch {
        // Un asset roto no impide abrir el Markdown; se conserva la referencia.
      }
    }),
  );

  const replacements = new Map<string, string>();
  let content = markdown.replace(IMAGE_MARKDOWN, (full, prefix, source, suffix) => {
    const displayUrl = loaded.get(source);
    if (!displayUrl) return full;
    replacements.set(displayUrl, source);
    return `${prefix}${displayUrl}${suffix}`;
  });
  return { content, replacements };
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
  };
}
