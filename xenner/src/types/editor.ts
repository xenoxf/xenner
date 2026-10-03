import type { DrawingTool } from "./drawing";

/**
 * Los tipos de bloque de texto que el editor sabe poner y quitar.
 *
 * Son los que salen en el menú del `+`. Los seis niveles de título de Markdown
 * se quedan en tres porque en el menú no hay un botón por cada nivel; los otros
 * tres se crean con el menú `/`.
 */
export type EditorBlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "ordered"
  | "quote";

/**
 * Un asset ya importado dentro de la nota: el contenido como `data:` URL para
 * que el navegador pueda enseñarlo, y la ruta dentro de `.assets` que es lo que
 * se escribe en el Markdown.
 *
 * La app guarda la ruta, nunca el `data:`: una nota con imágenes dentro es un
 * fichero de texto legible y portable.
 */
export interface ImportedEditorAsset {
  dataUrl: string;
  relativePath: string;
  revision?: string;
  fileName?: string;
}

/**
 * Lo que el editor expone hacia fuera.
 *
 * El editor no sabe qué ficheros hay ni qué diálogos tiene el sistema: eso vive
 * en el dock (`EditorPane`). Aquí solo se le pide que ponga algo en la nota o que
 * deje el cursor donde toca.
 */
export interface NoteEditorHandle {
  /** Pone el cursor en el texto, sin estorbar si el editor no está listo. */
  focus(): void;
  /** Inserta una pizarra en blanco y abre el lienzo. */
  insertWhiteboard(tool: DrawingTool): Promise<void>;
  /**
   * Inserta una imagen que ya está importada.
   *
   * `alt` es el pie de la imagen. Si el editor no llega a insertarla, deshace el
   * asset para no dejar un fichero huérfano en `.assets`.
   */
  insertImage(asset: ImportedEditorAsset, alt?: string): Promise<void>;
  /** Escribe un enlace al archivo adjunto, con su nombre como texto del enlace. */
  insertAttachment(relativePath: string, label: string): void;
  /** El Markdown que hay en el editor ahora mismo. */
  markdown(): string;
  /**
   * Entrega lo pendiente **ahora mismo**, sin esperar al retardo.
   *
   * Lo llama el almacén antes de cambiar de nota, de borrar, de renombrar o de
   * cerrar: sin esto, los últimos milisegundos de lo escrito se quedan en el
   * editor mientras el documento ya es otro, y se pierden.
   */
  flush(): void;
  /** Vuelve a leer el Markdown de la nota y a ponerlo en el editor. */
  reload(): Promise<void>;
}