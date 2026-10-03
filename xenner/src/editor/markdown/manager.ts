import { MarkdownManager } from "@tiptap/markdown";

import { createEditorExtensions, MARKDOWN_INDENTATION } from "../extensions/index.ts";
import type { EditorExtensionOptions } from "../extensions/index.ts";

/**
 * Un gestor de Markdown con exactamente las mismas extensiones que el editor.
 *
 * Por debajo está `@tiptap/markdown`, que no necesita DOM: el mismo
 * `parse`/`serialize` que usa el editor se puede ejecutar en Node. Eso es lo que
 * permite probar el Markdown de verdad —ida y vuelta, con sus nodos y sus
 * colores— sin levantar un navegador.
 *
 * Sin argumentos vale para los tests; en la app se le pasa el mismo
 * `EditorExtensionOptions` que al editor, porque un gestor con otras
 * extensiones serializa distinto de lo que se ve.
 *
 * La sangría se toma de la extensión del editor y no se escribe aquí otra vez:
 * es el mismo número que va a salir guardado en la nota.
 */
export function createNoteMarkdownManager(
  options?: EditorExtensionOptions,
): MarkdownManager {
  return new MarkdownManager({
    extensions: createEditorExtensions(options ?? { placeholder: "" }),
    indentation: MARKDOWN_INDENTATION,
  });
}