import type { JSONContent } from "@tiptap/core";
import type { MarkdownManager } from "@tiptap/markdown";

import { restoreNoteAssets } from "./assets.ts";
import type { NoteAssets } from "./assets.ts";

/**
 * Markdown → documento de Tiptap.
 *
 * `manager` sale de `editor.markdown.manager`, el de esta misma instancia del
 * editor: es el único que conoce las extensiones que el editor tiene puestas, y
 * otro distinto dejaría nodos que el esquema no tiene.
 *
 * El Markdown que entra es el de `loadNoteAssets`, con las rutas de `.assets`
 * ya cambiadas por `data:` URL: si entra el Markdown del disco, el editor
 * enseña huecos donde están las imágenes.
 */
export function parseNoteMarkdown(manager: MarkdownManager, markdown: string): JSONContent {
  return manager.parse(markdown);
}

/**
 * Documento de Tiptap → Markdown, con las rutas de `.assets` restauradas.
 *
 * Es lo que se guarda en la nota, así que lo que sale tiene que ser legible en
 * un editor de texto cualquiera y no una nota con megabytes de base64 dentro.
 */
export function serializeNoteMarkdown(
  manager: MarkdownManager,
  doc: JSONContent,
  assets: NoteAssets,
): string {
  return restoreNoteAssets(manager.serialize(doc), assets.paths);
}