import { Editor } from "@tiptap/core";
import type { MarkdownManager } from "@tiptap/markdown";

import {
  insertAttachmentLink,
  insertImage,
  insertWhiteboard,
  runCommand,
} from "./commands.ts";
import { createDrawingId, serializeDrawing } from "./drawing.ts";
import { createEditorExtensions } from "./extensions/index.ts";
import type { EditorExtensionOptions } from "./extensions/index.ts";
import { parseNoteMarkdown, serializeNoteMarkdown } from "./markdown/document.ts";
import { createNoteSerializer } from "./serialize.ts";
import type { NoteAssets } from "./markdown/assets.ts";
import type { DrawingTool } from "../types/drawing";
import type { ImportedEditorAsset, NoteEditorHandle } from "../types/editor";

/**
 * El editor de una nota, montado y con su handle.
 *
 * Aquí no se decide nada de la interfaz: se crea el `Editor` de Tiptap con las
 * extensiones del registro único, se le pasa el Markdown de la nota ya con los
 * assets en memoria, y se construye el `NoteEditorHandle` que usa el dock. Lo que
 * se le enseña a la persona está en `menu-content.ts` y lo que se hace con el
 * documento, en `commands.ts`.
 *
 * Dos cosas que antes vivían en el componente y que son de aquí:
 *
 * - **Guardar tiene retardo.** `onChange` no se llama en cada pulsación: el
 *   serializador espera a que se pare uno a escribir, y entrega una vez al perder
 *   el foco y una última vez al destruirse el editor.
 * - **El Markdown que sale lleva las rutas de `.assets`.** El documento solo
 *   conoce `data:` URLs; quien guarda quiere la nota con `.assets/imagen.png`,
 *   que es lo único que se puede abrir mañana en otro equipo.
 */

export interface CreateNoteEditorOptions extends EditorExtensionOptions {
  element: HTMLElement;
  /** Markdown inicial. Sin `assets`, el Markdown es tal cual. */
  initialMarkdown: string;
  /** `assets` ya cargados (ver `loadNoteAssets`). */
  assets: NoteAssets;
  /** Se llama con el Markdown cada vez que cambia el documento. */
  onChange(markdown: string): void;
  /** Se llama en cuanto el editor está montado y listo. */
  onReady?(handle: NoteEditorHandle): void;
  /**
   * Vuelve a leer el Markdown de la nota y sus assets.
   *
   * Lo necesita `handle.reload()`. El motor no sabe qué hay en el disco —no tiene
   * ni rutas ni gateway—, así que quien lo monta le pasa el `callback`; sin él,
   * `reload()` no puede hacer nada y lo dice en vez de fingir que sí.
   */
  reloadSource?(): Promise<{ markdown: string; assets: NoteAssets }>;
  /**
   * Importa el SVG de una pizarra nueva dentro de `.assets`.
   *
   * Elegir ficheros y escribirlos en el disco es cosa del dock, no del motor: aquí
   * solo se dibuja el SVG vacío y se pide que alguien lo guarde.
   */
  importWhiteboardAsset?(svg: string, fileName: string): Promise<ImportedEditorAsset>;
  /** Avisa de un fallo sin dejar la vista a medias. */
  reportFailure?(what: string, error: unknown): void;
}

/** Con qué nombre se guarda una pizarra nueva dentro de `.assets`. */
const ARCHIVO_PIZARRA = "pizarra.svg";

export function createNoteEditor(options: CreateNoteEditorOptions): Editor {
  const avisar = (what: string, error: unknown): void => {
    if (options.reportFailure) options.reportFailure(what, error);
    else console.error(`xenner: ${what}`, error);
  };

  // Una copia propia de los assets: esta nota va a importar imágenes y a guardar
  // pizarras mientras se escribe, y mutar los del que los pasó quien la montó
  // dejaría al resto del editor con rutas que ya no son suyas.
  const assets: NoteAssets = {
    markdown: options.assets.markdown,
    paths: new Map(options.assets.paths),
    revisions: new Map(options.assets.revisions),
  };

  const gestor = (editor: Editor): MarkdownManager => {
    const manager = editor.markdown;
    if (!manager) {
      throw new Error("El editor no tiene gestor de Markdown: falta la extensión Markdown");
    }
    return manager;
  };

  /** El Markdown del documento ahora mismo, con las rutas de `.assets` puestas. */
  const markdownDeAhora = (editor: Editor): string =>
    serializeNoteMarkdown(gestor(editor), editor.getJSON(), assets);

  const editor = new Editor({
    element: options.element,
    // El registro único decide qué tiene el editor, y solo él. `reportFailure` se
    // pasa para que los atajos y el pegado —que no tienen interfaz donde avisar—
    // lleguen a alguien: el `console.error` de antes no lo ve nadie.
    extensions: createEditorExtensions({ ...options, reportFailure: avisar }),
    content: options.initialMarkdown,
    contentType: "markdown",
  });

  const serializador = createNoteSerializer({
    read: () => markdownDeAhora(editor),
    write: (markdown) => options.onChange(markdown),
  });

  /**
   * Registra un asset recién importado.
   *
   * Sin esto el Markdown que sale llevaría dentro un `data:` URL de varios megas,
   * y una nota es un fichero de texto que se lee, se copia y se comparte.
   */
  function recordar(importado: ImportedEditorAsset): void {
    assets.paths.set(importado.dataUrl, importado.relativePath);
    if (importado.revision) assets.revisions.set(importado.dataUrl, importado.revision);
  }

  /**
   * Deshace un asset que se ha importado y no ha llegado a insertarse.
   *
   * Insertar es una transacción sobre el documento y puede fallar —el cursor
   * estaba en un sitio donde no cabe, el esquema no cuadra—; sin este deshecho el
   * archivo se quedaba huérfano en `.assets` sin aparecer en la nota. El error se
   * avisa pero **no** se propaga: el fallo que importa es el de la inserción, y ese
   * lo cuenta quien llama.
   */
  async function olvidar(importado: ImportedEditorAsset): Promise<void> {
    const borrar = options.whiteboard?.onDeleteAsset;
    if (!borrar) return;
    try {
      await borrar(importado.dataUrl);
      assets.paths.delete(importado.dataUrl);
      assets.revisions.delete(importado.dataUrl);
    } catch (error) {
      avisar("no se pudo borrar un archivo que no se llegó a insertar", error);
    }
  }

  /**
   * Inserta un bloque ya importado y **deshace el asset si no se pudo insertar**.
   *
   * Devuelve `false` cuando no se insertó, que es la señal que usa quien llama
   * para avisar en vez de dar por buena una inserción que no ocurrió.
   */
  async function insertar(importado: ImportedEditorAsset, poner: () => boolean): Promise<boolean> {
    editor.commands.focus();
    if (poner()) return true;
    await olvidar(importado);
    return false;
  }

  const handle: NoteEditorHandle = {
    focus() {
      editor.commands.focus();
    },

    async insertWhiteboard(tool: DrawingTool) {
      if (editor.isDestroyed || !options.importWhiteboardAsset) {
        avisar("no se pudo crear la pizarra", "el editor no está listo para insertar");
        return;
      }
      const drawingId = createDrawingId();
      let importado: ImportedEditorAsset | null = null;
      try {
        // Un SVG vacío: la pizarra nace en blanco y con el lienzo abierto
        // (`draft: true`), no con un dibujo de mentira.
        const asset = await options.importWhiteboardAsset(
          serializeDrawing([], drawingId),
          ARCHIVO_PIZARRA,
        );
        importado = asset;
        if (editor.isDestroyed) throw new Error("El editor se cerró mientras se importaba");
        recordar(asset);
        const insertado = await insertar(asset, () =>
          runCommand(editor, insertWhiteboard(asset, drawingId, tool, avisar)),
        );
        if (!insertado) avisar("no se pudo crear la pizarra", "el bloque no se insertó");
      } catch (error) {
        avisar("no se pudo crear la pizarra", error);
        if (importado) await olvidar(importado);
      }
    },

    async insertImage(asset: ImportedEditorAsset, alt?: string) {
      if (editor.isDestroyed) {
        await olvidar(asset);
        avisar("no se pudo insertar la imagen", "el editor no está listo");
        return;
      }
      const insertado = await insertar(asset, () =>
        runCommand(editor, insertImage(asset, alt, avisar)),
      );
      if (!insertado) avisar("no se pudo insertar la imagen", "el bloque no se insertó");
    },

    insertAttachment(relativePath: string, label: string) {
      if (editor.isDestroyed) return;
      editor.commands.focus();
      runCommand(editor, insertAttachmentLink(relativePath, label, avisar));
    },

    markdown() {
      if (editor.isDestroyed) return "";
      return markdownDeAhora(editor);
    },

    flush() {
      if (editor.isDestroyed) return;
      serializador.flush();
    },

    async reload() {
      if (editor.isDestroyed) return;
      const fuente = options.reloadSource;
      if (!fuente) {
        avisar("no se pudo recargar la nota", "no hay forma de saber qué hay en el disco");
        return;
      }
      try {
        const { assets: nuevos } = await fuente();
        if (editor.isDestroyed) return;
        // Antes de poner el contenido se **olvida** lo pendiente: si no, el
        // temporizador del retardo entregaría después el Markdown viejo y
        // borraría lo que acaba de venir del disco. Y no se suelta con `flush()`,
        // porque eso escribiría el contenido viejo en el disco justo antes de
        // cargar el nuevo: recargar para traerse un cambio externo lo revertiría.
        serializador.cancel();
        // Los assets se sustituyen enteros: los del Markdown anterior ya no están
        // en la nota, y quedarse con ellos haría escribir rutas que no existen.
        assets.markdown = nuevos.markdown;
        assets.paths.clear();
        for (const [dataUrl, ruta] of nuevos.paths) assets.paths.set(dataUrl, ruta);
        assets.revisions.clear();
        for (const [dataUrl, revision] of nuevos.revisions) assets.revisions.set(dataUrl, revision);
        // Sin `emitUpdate`: el Markdown viene de fuera y ya está guardado donde
        // toca, así que volver a avisar sería escribir la nota otra vez sin
        // motivo. El historial se conserva, de modo que un deshacer devuelve el
        // contenido anterior.
        const documento = parseNoteMarkdown(gestor(editor), assets.markdown);
        if (!editor.commands.setContent(documento, { emitUpdate: false })) {
          throw new Error("el Markdown de la nota no vale para el esquema del editor");
        }
      } catch (error) {
        avisar("no se pudo recargar la nota", error);
      }
    },
  };

  editor.on("update", () => serializador.schedule());
  // Al perder el foco no hay a quién esperar: el retardo podría tardar un cuarto
  // de segundo, y quien está fuera del editor ya ha escrito en otro sitio.
  editor.on("blur", () => serializador.flush());
  // Y al destruirse, una última entrega: si no, lo escrito en los últimos
  // 250 ms no se guardaría nunca. Con esto no queda ningún temporizador vivo.
  editor.on("destroy", () => serializador.dispose());

  options.onReady?.(handle);
  return editor;
}