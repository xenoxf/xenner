import { commandsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import {
  addBlockTypeCommand,
  linkSchema,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { createParagraphNear, splitBlock } from "@milkdown/kit/prose/commands";
import type { NodeType } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { EditorBlockType } from "../types/editor";

/**
 * Lo que el editor **hace** cuando alguien pulsa algo.
 *
 * Va aparte de `crepe-config.ts` —qué se le enseña a la persona— y del
 * componente —cómo se monta— porque son tres cosas distintas. Aquí vive todo lo
 * que despacha una transacción sobre el documento.
 *
 * **Ninguna función traga excepciones.** Devuelven `false` cuando no han podido
 * hacerlo y dejan el documento como estaba. Antes había bloques `catch` sin
 * cuerpo alrededor de casi todo esto, y eso fue justo lo que escondió el fallo
 * más difícil de depurar del editor: una transacción a medio hacer deja la
 * vista a medias, el serializador de Markdown falla sobre ese documento, no se
 * guarda nada y ProseMirror se queda sin poder despachar. Quien escribe se
 * queda con un texto que desaparece y ninguna explicación. Un fallo se informa,
 * no se entierra.
 */

/** Avisa de un fallo sin dejar la vista a medias. */
export type ReportFailure = (what: string, error: unknown) => void;

/**
 * Cambia el tipo de bloque de lo que está seleccionado.
 *
 * Los comandos de Milkdown ya saben aplicar el cambio a **todos** los bloques
 * que toca la selección, así que aquí no hay que recorrerlos: se les llama y
 * ellos hacen lo suyo. Devuelve `false` si el comando no hizo nada, y eso se
 * cuenta como fallo: un botón que no responde en silencio parece roto.
 */
export function applyBlockType(
  ctx: Ctx,
  type: EditorBlockType,
  report: ReportFailure,
): boolean {
  const commands = ctx.get(commandsCtx);
  try {
    const applied =
      type === "paragraph"
        ? commands.call(turnIntoTextCommand.key)
        : type === "heading1"
          ? commands.call(wrapInHeadingCommand.key, 1)
          : type === "heading2"
            ? commands.call(wrapInHeadingCommand.key, 2)
            : type === "heading3"
              ? commands.call(wrapInHeadingCommand.key, 3)
              : type === "bullet"
                ? commands.call(wrapInBulletListCommand.key)
                : type === "ordered"
                  ? commands.call(wrapInOrderedListCommand.key)
                  : commands.call(wrapInBlockquoteCommand.key);
    if (!applied) report(`el tipo ${type} no se pudo aplicar`, "el comando no hizo nada");
    return applied;
  } catch (error) {
    report(`el tipo ${type} no se pudo aplicar`, error);
    return false;
  }
}

/**
 * Deja el cursor al final de lo que se acaba de retocar, con nada seleccionado.
 *
 * Sin esto la selección se queda puesta y el siguiente carácter sustituye el
 * texto entero: cambiar el tipo y seguir escribiendo —el gesto más natural del
 * mundo— borra lo que se acaba de formatear. El texto se conserva entero; lo
 * que se suelta es la selección, que ya hizo su trabajo.
 */
export function leaveCaretBehind(view: EditorView, report: ReportFailure): void {
  try {
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.near(view.state.selection.$to, 1))
        .scrollIntoView(),
    );
  } catch (error) {
    report("el cambio se aplicó pero el cursor no se quedó al final", error);
  }
}

/**
 * Escribe un enlace a un archivo adjunto.
 *
 * Va en su propia línea porque es como se lee: si el cursor estaba a media
 * frase, partir el bloque deja la frase arriba y el adjunto debajo. Con texto
 * seleccionado, ese texto se sustituye: adjuntar encima de un texto significa
 * que ese texto era el nombre del archivo.
 */
export function insertAttachmentLink(
  ctx: Ctx,
  view: EditorView,
  relativePath: string,
  label: string,
  report: ReportFailure,
): boolean {
  const text = label.trim() || "Archivo";
  try {
    if (!view.state.selection.empty) view.dispatch(view.state.tr.deleteSelection());
    if (!isEmptyBlock(view)) {
      // `createParagraphNear` no hace nada al final del documento; ahí lo que
      // abre la línea de abajo es `splitBlock`.
      if (!createParagraphNear(view.state, view.dispatch)) {
        splitBlock(view.state, view.dispatch);
      }
    }
    const from = view.state.selection.from;
    const mark = linkSchema.type(ctx).create({ href: relativePath, title: null });
    view.dispatch(
      view.state.tr
        .insertText(text, from)
        .addMark(from, from + text.length, mark)
        .scrollIntoView(),
    );
    return true;
  } catch (error) {
    report("no se pudo escribir el enlace al archivo", error);
    return false;
  }
}

/**
 * Inserta un bloque —una imagen o una pizarra— donde está el cursor, y deja una
 * línea debajo para poder seguir escribiendo sin tabular.
 *
 * `createParagraphNear` es lo que abre esa línea. Sin `scrollIntoView()` a
 * propósito: el bloque recién insertado es alto, y un scroll mínimo desplaza la
 * vista justo cuando se está mirando la línea desde la que se insertó.
 */
export function insertBlock(
  ctx: Ctx,
  view: EditorView,
  nodeType: NodeType,
  attrs: Record<string, unknown>,
  report: ReportFailure,
): boolean {
  try {
    const inserted = ctx.get(commandsCtx).call(addBlockTypeCommand.key, {
      nodeType: nodeType.create(attrs),
    });
    if (!inserted) {
      report("no se pudo insertar el bloque", "el comando no hizo nada");
      return false;
    }
    createParagraphNear(view.state, view.dispatch);
    leaveCaretBehind(view, report);
    return true;
  } catch (error) {
    report("no se pudo insertar el bloque", error);
    return false;
  }
}

/**
 * Deja el cursor donde se pueda escribir.
 *
 * Insertar desde el dock puede llegar con una selección de nodo —una imagen
 * elegida con un clic— o sin que el editor tenga el foco, porque el botón está
 * fuera del `contenteditable`. Sin esto el bloque caía al final de la nota.
 * Idempotente: si ya hay un cursor de texto, no toca nada.
 */
export function focusTextCursor(
  view: EditorView,
  lastTextPos: number | null,
  report: ReportFailure,
): void {
  const { selection } = view.state;
  if (selection instanceof TextSelection && selection.$from.parent.isTextblock) return;
  if (lastTextPos === null) return;
  try {
    const pos = Math.min(Math.max(lastTextPos, 0), view.state.doc.content.size);
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos), 1)));
  } catch (error) {
    report("no se pudo devolver el cursor al texto", error);
  }
}

function isEmptyBlock(view: EditorView): boolean {
  const { $from } = view.state.selection;
  return $from.parent.isTextblock && $from.parent.content.size === 0;
}
