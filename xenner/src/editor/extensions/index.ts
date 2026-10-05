import type { Extensions } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";

import { KeyboardNote } from "../keyboard.ts";
import { PasteNote } from "../paste.ts";
import { NoteAttachment } from "./note-attachment.ts";
import type { NoteAttachmentActions } from "./note-attachment.ts";
import { NoteImage } from "./note-image.ts";
import { NoteParagraph } from "./note-paragraph.ts";
import { TextColor } from "./text-color.ts";
import { Whiteboard } from "./whiteboard.ts";
import type { WhiteboardViewOptions } from "./whiteboard.ts";

export type { WhiteboardViewOptions };
export { NoteAttachment };
export type { NoteAttachmentActions, AttachmentMenuTarget } from "./note-attachment.ts";
export { createNoteAttachmentView, pesoDe } from "./note-attachment.ts";
export {
  NoteParagraph,
  TEXT_ALIGNS,
  alignInSelection,
  puedeAlinear,
  alinearDe,
} from "./note-paragraph.ts";
export type { TextAlign } from "./note-paragraph.ts";

/**
 * El registro de gramáticas, una sola vez.
 *
 * `createLowlight` construye los resaltadores, que es lo caro: hacerlo dentro de
 * `createEditorExtensions` lo repetiría en cada creación de editor y en cada
 * `MarkdownManager` de los tests.
 */
const lowlight = createLowlight(common);

export interface EditorExtensionOptions {
  /** Texto de una nota vacía. */
  placeholder: string;
  whiteboard?: WhiteboardViewOptions;
  /**
   * Lo que la tarjeta de un adjunto necesita de la interfaz.
   *
   * Sin esto la vista de nodo no se monta y el adjunto sale como un enlace: los
   * tests, que no tienen interfaz, montan el mismo editor con la misma gramática y
   * por eso no dependen de que haya acciones.
   */
  attachment?: NoteAttachmentActions;
  /**
   * A quién se le avisa de un fallo que no tiene a quién preguntarle.
   *
   * Los atajos y el pegado se ejecutan sin interfaz —vienen de una tecla o del
   * portapapeles—, así que no hay ningún sitio donde enseñar un error. Si no se
   * pasa, avisan por consola, que es mejor que tragárselo.
   */
  reportFailure?(what: string, error: unknown): void;
}

/**
 * Cómo se sangra el Markdown al salir.
 *
 * Vive aquí y no en los dos sitios que lo necesitan —la extensión `Markdown` del
 * editor y el `MarkdownManager` de los tests— porque si se escribiera dos veces
 * acabaría disagree: el editor guardaría las listas con 4 espacios y el gestor
 * con 2, y el Markdown de una nota no describiría lo que se ve.
 */
export const MARKDOWN_INDENTATION = { style: "space", size: 2 } as const;

/**
 * Las extensiones del editor, y solo las suyas.
 *
 * Este es el **único** sitio donde se declara qué tiene el editor: ni el panel ni
 * los menús pueden pasar un array propio, porque un `MarkdownManager` con otro
 * esquema serializa distinto de lo que se ve y el Markdown guardado deja de
 * describir la nota.
 */
export function createEditorExtensions(options: EditorExtensionOptions): Extensions {
  return [
    StarterKit.configure({
      // El bloque de código es el de `lowlight`, no el de StarterKit: sin
      // resaltado un bloque de código es media nota.
      codeBlock: false,
      // El párrafo es el de Xenner, que además sabe en qué lado se pega el texto.
      paragraph: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        // Un enlace se abre con el menú o con Ctrl, no con un clic perdido
        // mientras se está escribiendo.
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
      },
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    NoteImage,
    NoteParagraph,
    NoteAttachment.configure({ actions: options.attachment }),
    TableKit,
    TaskList,
    TaskItem.configure({ nested: true }),
    BlockMath,
    InlineMath,
    TextColor,
    Whiteboard.configure({ renderNodeView: options.whiteboard?.renderNodeView }),
    Placeholder.configure({
      placeholder: options.placeholder,
      emptyEditorClass: "is-editor-empty",
    }),
    Markdown.configure({ indentation: MARKDOWN_INDENTATION }),
    /**
     * Los atajos y el pegado van **al final**, y el orden no es casualidad.
     *
     * ProseMirror prueba los plugins en el orden inverso al de la lista, así que
     * lo último que se declara es lo primero que ve la tecla. Van después de
     * `StarterKit` a propósito: `Mod-Alt-1` lo pone también `StarterKit` como
     * «alternar título» —la segunda pulsación lo quitaba—, y aquí se quiere
     * ponerlo siempre. Con el orden dado, el de aquí gana.
     */
    KeyboardNote.configure({ report: options.reportFailure }),
    PasteNote.configure({ report: options.reportFailure }),
  ];
}