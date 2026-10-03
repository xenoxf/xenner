import type { ImportedEditorAsset } from "../types/editor";
import type { ImportedAsset, ImportedAttachment } from "../types/workspace";
import { getWorkspaceGateway } from "./workspace/gateway";

export { resolveAssetReference } from "../editor/asset-paths";

/**
 * Los ficheros que se pueden meter en una nota.
 *
 * Aquí solo hay **entrada y salida de bytes**: importar un fichero, elegir uno del
 * sistema, actualizarlo o borrarlo. Lo que el editor hace con el resultado —cargar
 * los assets de una nota antes de abrirla y volver a escribir las rutas al
 * serializar— vive en `editor/markdown/assets.ts`, que es del motor y se puede
 * probar sin Tauri.
 *
 * La frontera está puesta para que este módulo no dependa de nada del editor:
 * los diálogos del sistema son cosa de la app, no del motor.
 */

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

/**
 * Adjunta un archivo a la nota y devuelve dónde quedó y con qué nombre.
 *
 * A diferencia de una imagen, un adjunto no se convierte en `data:` ni se
 * previsualiza: es un enlace a un archivo de `.assets`, y su contenido no vuelve
 * a JavaScript porque pesa y porque no hay nada que enseñar en línea. El nombre
 * original es el que se escribe en la nota, que es lo que uno espera reconocer
 * dentro de un mes.
 */
export async function importAttachmentForEditor(
  notePath: string,
  file: File,
): Promise<ImportedAttachment> {
  const dataBase64 = await fileToBase64(file);
  return getWorkspaceGateway().importAttachment(notePath, file.name, dataBase64);
}

/** Igual, pero dejando que sea el diálogo del sistema el que elija el archivo. */
export async function chooseAttachmentForEditor(
  notePath: string,
): Promise<ImportedAttachment | null> {
  return getWorkspaceGateway().chooseAttachment(notePath);
}

export function editorSupportsNativeAttachmentPicker(): boolean {
  return getWorkspaceGateway().canChooseAttachment;
}