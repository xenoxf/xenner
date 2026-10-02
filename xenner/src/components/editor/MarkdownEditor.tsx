import type { Crepe as CrepeInstance } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
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
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose, replaceAll } from "@milkdown/kit/utils";
import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { blockTypesInSelection } from "../../editor/block-type";
import { EDITOR_BLOCKS } from "../../data/editor";
import {
  deleteAssetForEditor,
  importImageForEditor,
  prepareMarkdownForEditor,
  serializeMarkdownFromEditor,
  updateAssetForEditor,
} from "../../services/editorAssets";
import { notifyError, notifySuccess } from "../../services/toastService";
import { leaveEditor } from "../../services/editorSession";
import { createDrawingId, serializeDrawing } from "../../editor/drawing";
import {
  DEFAULT_TEXT_BACKGROUND,
  DEFAULT_TEXT_COLOR,
  normalizeTextColor,
  textColorMark,
  textColorRemark,
} from "../../editor/text-color";
import { whiteboardNode, whiteboardRemark } from "../../editor/whiteboard-node";
import styles from "../../styles/components/MarkdownEditor.module.css";
import type { DrawingTool } from "../../types/drawing";
import type {
  EditorBlockType,
  MarkdownEditorHandle,
  PreparedMarkdown,
} from "../../types/editor";
import { createWhiteboardView } from "./WhiteboardNodeView";

const WHITEBOARD_SLASH_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 5h16v12H4z" />
    <path d="m7 14 3-3 2 2 2-2 3 3" />
    <path d="M7 9h.01" />
  </svg>
`;

const TEXT_COLOR_TOOLBAR_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="m14.6 17.9-1.3-1.3a1 1 0 0 1 0-1.4l1.4-1.4a1 1 0 0 1 1.4 0l1.3 1.3a1 1 0 0 1 0 1.4l-1.4 1.4a1 1 0 0 1-1.4 0Z" />
    <path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM15 5l4 4" />
  </svg>
`;

const TEXT_BACKGROUND_TOOLBAR_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="m4 16 8-8 4 4-8 8H4v-4Z" />
    <path d="m12 8 4-4 4 4-4 4M4 20h16" />
  </svg>
`;

/**
 * Ancho del menú de tipos, en píxeles. Va en una constante y no solo en el CSS
 * porque el cálculo de dónde ponerlo tiene que decir lo mismo que el ancho
 * real: si el menú fuera más ancho de lo que el cálculo asume, se saldría por el
 * borde de la nota.
 */
const BLOCK_MENU_WIDTH = 196;

interface BlockMenuPlacement {
  left: number;
  top: number;
}

const BLOCK_MENU_TOOLBAR_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
`;

interface MarkdownEditorProps {
  notePath: string;
  initialValue: string;
  reloadToken: number;
  onChange(markdown: string): void;
  onReady?(handle: MarkdownEditorHandle): void;
  onDispose?(): void;
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [blockMenu, setBlockMenu] = createSignal<BlockMenuPlacement | null>(null);
  /** El tipo que ya tienen lo seleccionado, para marcarlo en el menú. */
  const [activeBlock, setActiveBlock] = createSignal<EditorBlockType | null>(null);
  let root: HTMLDivElement | undefined;
  let blockMenuPanel: HTMLDivElement | undefined;
  let crepe: CrepeInstance | null = null;
  let textColorInput: HTMLInputElement | undefined;
  let textBackgroundInput: HTMLInputElement | undefined;
  let pendingTextSelection: { from: number; to: number } | null = null;
  let disposed = false;
  let lastReloadToken = props.reloadToken;
  let prepared: PreparedMarkdown = {
    content: props.initialValue,
    replacements: new Map(),
    revisions: new Map(),
  };
  let insertWhiteboardCommand: ((tool: DrawingTool) => Promise<void>) | null = null;
  let insertingWhiteboard = false;
  // Última posición del cursor de TEXTO conocida. Sin ella, insertar un bloque
  // (pizarra o imagen) desde el dock caía al final de la nota cuando la
  // selección era un NodeSelection o el editor aún no había recuperado el foco
  // tras el clic en la barra.
  let textCursorPos: number | null = null;

  /**
   * El texto seleccionado en el momento en que el editor perdió el foco.
   *
   * Es la pieza que faltaba para poder cambiar el tipo de un texto
   * seleccionado: el dock abre un menú que se queda con el foco (para que se
   * pueda recorrer con el teclado) y ese menú deja el `contenteditable` sin
   * él. ProseMirror aguanta la selección en el estado, pero entre el clic y el
   * comando hay un `queueMicrotask` que mueve el foco, y lo que se perdía era
   * justo el texto que se quería cambiar: el tipo se acababa poniendo en la
   * línea de al lado.
   *
   * Guardarla en el `blur` —y solo ahí— es lo que evita el problema de envejeci-
   * miento: la selección guardada vale para el gesto que la dejó obsoleta, y
   * cualquier clic o tecla posterior dentro del editor la borra.
   */
  let selectionOnBlur: { from: number; to: number } | null = null;

  function rememberTextCursor(view: EditorView): void {
    const { selection } = view.state;
    if (!(selection instanceof TextSelection)) return;
    if (!selection.$from.parent.isTextblock) return;
    textCursorPos = selection.from;
  }

  /**
   * Descarta la selección guardada en cuanto el editor vuelve a tener una
   * selección propia. Se queda solo si la selección que hay ahora es
   * exactamente la que se guardó al perder el foco, que es el caso normal del
   * menú: el editor no se ha movido.
   */
  function forgetStaleSelectionOnBlur(view: EditorView): void {
    if (!selectionOnBlur) return;
    const { selection } = view.state;
    if (
      selection instanceof TextSelection &&
      selection.from === selectionOnBlur.from &&
      selection.to === selectionOnBlur.to
    ) {
      return;
    }
    selectionOnBlur = null;
  }

  /**
   * Devuelve al texto seleccionado lo que le corresponde: pone el tipo de bloque
   * sobre lo que estaba seleccionado, no sobre la línea donde quedó el cursor.
   * Es idempotente y no toca nada si no hay nada que recuperar.
   */
  function restoreSelectionOnBlur(view: EditorView): void {
    const remembered = selectionOnBlur;
    selectionOnBlur = null;
    if (!remembered) return;
    const { selection } = view.state;
    if (
      selection instanceof TextSelection &&
      !selection.empty &&
      selection.from === remembered.from &&
      selection.to === remembered.to
    ) {
      return;
    }
    const { doc } = view.state;
    if (remembered.from < 0 || remembered.to > doc.content.size || remembered.from >= remembered.to) {
      return;
    }
    try {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(doc, remembered.from, remembered.to)),
      );
    } catch {
      // Un texto que ya no se puede seleccionar deja intacta la selección actual.
    }
  }

  // Recoloca la selección en el cursor de texto conocido. Es idempotente: si
  // ya hay una selección de texto válida, no toca nada.
  function restoreTextCursor(view: EditorView): void {
    const { selection } = view.state;
    if (selection instanceof TextSelection && selection.$from.parent.isTextblock) return;
    if (textCursorPos === null) return;
    const pos = Math.min(Math.max(textCursorPos, 0), view.state.doc.content.size);
    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos), 1)));
    } catch {
      // Una selección que ya no se puede reconstruir deja intacta la actual.
    }
  }

  /**
   * Deja el cursor en el párrafo que se acaba de crear tras el bloque, para
   * poder seguir escribiendo sin tabular. SIN `scrollIntoView()` a propósito:
   * el bloque recién insertado es alto y un scroll mínimo desplaza la vista
   * justo cuando la persona está mirando la línea desde la que insertó.
   */
  function settleAfterInsertion(view: EditorView): void {
    try {
      const near = TextSelection.near(view.state.selection.$to, 1);
      view.dispatch(view.state.tr.setSelection(near));
    } catch {
      // El bloque ya está insertado; no vale la pena fallar por el cursor.
    }
    view.focus();
  }

  const textCursorTracker = $prose(
    () =>
      new Plugin({
        key: new PluginKey("xennerTextCursor"),
        // El editor pierde el foco cada vez que se abre un menú, un diálogo de
        // color o el propio dock. Lo que había seleccionado en ese momento es lo
        // que hay que volver a poner antes de aplicar nada.
        handleDOMEvents: {
          blur: (view: EditorView) => {
            if (disposed) return false;
            const { selection } = view.state;
            selectionOnBlur =
              selection instanceof TextSelection && !selection.empty
                ? { from: selection.from, to: selection.to }
                : null;
            return false;
          },
        },
        view: () => ({
          update: (view) => {
            if (disposed) return;
            rememberTextCursor(view);
            forgetStaleSelectionOnBlur(view);
          },
        }),
      }),
  );

  // --- Barra flotante de formato -------------------------------------------
  // Aquí ya no hay nada que la esconda: se ve cuando Crepe dice que se ve.
  //
  // Antes se tapaba con `opacity: 0` salvo que el puntero estuviera sobre el
  // texto seleccionado, y eso la volvía inusable: al seleccionar con el
  // teclado —Mayús flechas, doble clic, Ctrl+A— el puntero no se mueve, así
  // que la barra no salía nunca y no había forma de poner negrita, cursiva o un
  // título. Con el ratón era una lotería, y además la barra invisible seguía
  // encima del texto cogiendo clics. Que se ve es lo que espera cualquiera
  // que acaba de seleccionar texto; Crepe ya la coloca encima de la selección,
  // que es justo donde no estorba.
  //
  // Y a lo seleccionado hay que poder darle tipo. Crepe pone en su barra
  // negrita, cursiva, tachado, código, fórmula y enlace, pero ningún botón que
  // cambie el bloque: sin eso el tipo de texto solo se podía cambiar con el
  // cursor en una línea, nunca sobre un texto seleccionado. Por eso el grupo
  // `blocks` de abajo.

  /**
   * Pone un tipo de bloque a lo que está seleccionado.
   *
   * `setBlockType` del handle y los botones del mini menú pasan por aquí, y
   * ambos caminos tienen que acabar igual: lo seleccionado cambia de tipo, no la
   * línea de al lado. Los dos empiezan recuperando la selección del `blur` —el
   * dock y la propia barra se quedan con el foco— y solo después dejan el
   * cursor ir al último texto conocido, que es lo que hace falta cuando no hay
   * nada seleccionado.
   */
  function applyBlockType(type: EditorBlockType): boolean {
    if (!crepe) return false;
    const view = crepe.editor.ctx.get(editorViewCtx);
    restoreSelectionOnBlur(view);
    restoreTextCursor(view);
    const commands = crepe.editor.ctx.get(commandsCtx);
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
    view.focus();
    return applied;
  }

  /**
 * Escribe en la nota un enlace al archivo adjunto.
 *
 * Se inserta como un enlace de commonmark —`[Informe.pdf](./.assets/…)`— y no
 * como un bloque propio: así el Markdown sigue siendo legible desde cualquier
 * editor, y la referencia es un archivo al lado de la nota en vez de una imagen
 * incrustada. No necesita ir en `prepared.replacements` porque ahí solo se
 * sustituyen los `data:` que no caben en el archivo.
 *
 * El enlace va en su propia línea: si el cursor estaba a media frase, partir el
 * bloque deja la frase intacta arriba y el adjunto debajo, que es como se lee.
 */
function insertAttachmentLink(relativePath: string, label: string): void {
  if (!crepe) return;
  const view = crepe.editor.ctx.get(editorViewCtx);
  restoreTextCursor(view);
  const text = label.trim() || "Archivo";
  const mark = linkSchema.type(crepe.editor.ctx).create({ href: relativePath, title: null });

  // Con texto seleccionado se sustituye: adjuntar encima de un texto
  // seleccionado significa que ese texto era el nombre del archivo.
  if (!view.state.selection.empty) view.dispatch(view.state.tr.deleteSelection());

  const $from = view.state.selection.$from;
  const blockIsEmpty = $from.parent.isTextblock && $from.parent.content.size === 0;
  if (!blockIsEmpty) {
    // `createParagraphNear` no hace nada al final del documento; ahí lo que
    // abre la línea de abajo es `splitBlock`.
    if (!createParagraphNear(view.state, view.dispatch)) splitBlock(view.state, view.dispatch);
  }

  const from = view.state.selection.from;
  const transaction = view.state.tr
    .insertText(text, from)
    .addMark(from, from + text.length, mark);
  view.dispatch(transaction.scrollIntoView());
  view.focus();
}

/**
 * Abre o cierra el menú de tipos de texto, el que cuelga del `+` de la barra.
 *
 * Se ancla **debajo de la barra flotante**, no encima de la selección: encima
 * está la propia barra, y dos superficies superpuestas sobre el texto es
 * exactamente lo que se quiere evitar. Se mide la barra de verdad —es un
 * elemento del DOM, y Crepe la coloca con `floating-ui`— así que el menú sale
 * pegado a ella aunque la selección esté en cualquier parte de la nota.
 */
function toggleBlockMenu(): void {
  if (blockMenu()) {
    closeBlockMenu();
    return;
  }
  if (!crepe || !root) return;
  const toolbar = root.querySelector<HTMLElement>(".milkdown-toolbar");
  const bounds = root.getBoundingClientRect();
  if (!toolbar) return;
  const anchor = toolbar.getBoundingClientRect();
  // El `left` se recorta contra el ancho real de la nota para que un menú
  // abierto cerca del borde derecho no quede medio fuera.
  const left = Math.max(
    8,
    Math.min(anchor.left - bounds.left, bounds.width - BLOCK_MENU_WIDTH - 8),
  );
  const view = crepe.editor.ctx.get(editorViewCtx);
  const { selection } = view.state;
  const active = blockTypesInSelection(
    view.state.doc,
    selection.from,
    selection.to,
  );
  // Con más de un tipo en la selección no hay uno que poner de relieve.
  setActiveBlock(active.size === 1 ? [...active][0] : null);
  setBlockMenu({ left, top: anchor.bottom - bounds.top + 6 });
}

function closeBlockMenu(): void {
  setBlockMenu(null);
  setActiveBlock(null);
}

/**
 * Fuera del menú o con Escape se cierra. Se registra al abrirlo y no antes:
 * mientras está cerrado no hay nada que cerrar y un `pointerdown` en cualquier
 * sitio —incluido dentro del editor— se ignora.
 *
 * La barra flotante queda excepta, y no por descuido: Crepe dispara sus botones
 * en `pointerdown`, así que si este menú se cerrara con el clic en la barra, el
 * `+` se cerraría aquí y su propio `onRun` lo volvería a abrir en el mismo
 * gesto, así que el botón no cerraría nunca. Los botones de la barra son de
 * Crepe y cada uno sabe lo que hace; este menú se aparta al hacer clic en el
 * texto, que es cuando de verdad deja de importar.
 */
function watchBlockMenuDismissal(): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (blockMenuPanel?.contains(target)) return;
    if (target instanceof Element && target.closest(".milkdown-toolbar")) return;
    closeBlockMenu();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeBlockMenu();
    crepe?.editor.ctx.get(editorViewCtx).focus();
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}

function captureTextSelection(): void {
    if (!crepe) return;
    const { from, to } = crepe.editor.ctx.get(editorViewCtx).state.selection;
    pendingTextSelection = from === to ? null : { from, to };
  }

  function openTextStylePicker(input: HTMLInputElement | undefined): void {
    if (!input) return;
    captureTextSelection();
    input.click();
  }

  function applyTextStyleValue(target: "color" | "background", value: string): boolean {
    if (!crepe) return false;
    const normalized = normalizeTextColor(value);
    if (!normalized) return false;
    const view = crepe.editor.ctx.get(editorViewCtx);
    const selection = pendingTextSelection ?? view.state.selection;
    const { from, to } = selection;
    if (from === to) return false;

    const markType = textColorMark.type(crepe.editor.ctx);
    let currentColor = "";
    let currentBackground = "";
    view.state.doc.nodesBetween(from, to, (node) => {
      if (!node.isText) return;
      const mark = node.marks.find((candidate) => candidate.type === markType);
      if (!mark) return;
      if (!currentColor) currentColor = normalizeTextColor(mark.attrs.color) ?? "";
      if (!currentBackground) currentBackground = normalizeTextColor(mark.attrs.background) ?? "";
    });
    const attrs = target === "color"
      ? { color: normalized, background: currentBackground }
      : { color: currentColor, background: normalized };
    const transaction = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
    transaction.removeMark(from, to, markType);
    if (attrs.color || attrs.background) {
      transaction.addMark(from, to, markType.create(attrs));
    }
    view.dispatch(transaction.scrollIntoView());
    view.focus();
    pendingTextSelection = null;
    return true;
  }

  onMount(async () => {
    if (!root) return;
    try {
      prepared = await prepareMarkdownForEditor(props.notePath, props.initialValue);
      if (disposed) return;
      const [{ Crepe }] = await Promise.all([
        import("@milkdown/crepe"),
        import("@milkdown/crepe/theme/common/style.css"),
        import("@milkdown/crepe/theme/frame.css"),
      ]);
      if (disposed) return;
      let instance: CrepeInstance;
      const insertWhiteboard = async (tool: DrawingTool): Promise<void> => {
        if (insertingWhiteboard) return;
        insertingWhiteboard = true;
        let imported: Awaited<ReturnType<typeof importImageForEditor>> | null = null;
        try {
          const drawingId = createDrawingId();
          const file = new File([serializeDrawing([], drawingId)], "pizarra.svg", {
            type: "image/svg+xml",
          });
          imported = await importImageForEditor(props.notePath, file);
          prepared.replacements.set(imported.dataUrl, imported.relativePath);
                if (imported.revision) prepared.revisions.set(imported.dataUrl, imported.revision);
          const node = whiteboardNode.type(instance.editor.ctx).create({
            src: imported.dataUrl,
            tool,
            draft: true,
            drawingId,
          });
          const view = instance.editor.ctx.get(editorViewCtx);
          // El dock no roba el foco, pero la importación del asset es async:
          // recolocamos la selección justo antes de insertar para que la
          // pizarra caiga donde estaba el cursor de texto.
          restoreTextCursor(view);
          const commands = instance.editor.ctx.get(commandsCtx);
          const inserted = commands.call(addBlockTypeCommand.key, { nodeType: node });
          if (!inserted) throw new Error("No se pudo insertar el bloque de pizarra");
          createParagraphNear(view.state, view.dispatch);
          settleAfterInsertion(view);
        } catch (error) {
          if (imported) {
            await deleteAssetForEditor(props.notePath, imported.relativePath).catch(() => undefined);
            prepared.replacements.delete(imported.dataUrl);
            prepared.revisions.delete(imported.dataUrl);
          }
          throw error;
        } finally {
          insertingWhiteboard = false;
        }
      };
      insertWhiteboardCommand = insertWhiteboard;
      instance = new Crepe({
        root,
        defaultValue: prepared.content,
        features: {
          [Crepe.Feature.AI]: false,
          [Crepe.Feature.TopBar]: false,
          [Crepe.Feature.BlockEdit]: true,
          [Crepe.Feature.ImageBlock]: true,
        },
        featureConfigs: {
          [Crepe.Feature.BlockEdit]: {
            blockHandle: {
              root,
              getOffset: () => 10,
            },
            slashMenu: {
              root,
              offset: 8,
            },
            textGroup: {
              label: "Texto",
              text: { label: "Texto" },
              h1: { label: "Título 1" },
              h2: { label: "Título 2" },
              h3: { label: "Título 3" },
              h4: { label: "Título 4" },
              h5: { label: "Título 5" },
              h6: { label: "Título 6" },
              quote: { label: "Cita" },
              divider: { label: "Separador" },
            },
            listGroup: {
              label: "Listas",
              bulletList: { label: "Viñetas" },
              orderedList: { label: "Numerada" },
              taskList: { label: "Tareas" },
            },
            advancedGroup: {
              label: "Insertar",
              image: { label: "Imagen" },
              codeBlock: { label: "Código" },
              table: { label: "Tabla" },
              math: { label: "Fórmula" },
            },
            buildMenu(builder) {
              builder.addGroup("media", "Medio").addItem("whiteboard", {
                icon: WHITEBOARD_SLASH_ICON,
                label: "Pizarra",
                onRun: () => {
                  const command = insertWhiteboardCommand;
                  if (!command) return;
                  void command("pen").catch((error) => {
                    notifyError("No se pudo crear la pizarra", error);
                  });
                },
              });
            },
          },
          [Crepe.Feature.Placeholder]: {
            text: "Escribe tu nota…",
            mode: "doc",
          },
          [Crepe.Feature.Toolbar]: {
            buildToolbar(builder) {
              // El tipo de bloque entra por UN botón, no por siete. Con los
              // siete la barra dejaba de caber sobre el texto y se partía en dos
              // filas: una barra de formato que tapa lo que está seleccionado es
              // justo lo que hay que evitar. El `+` abre un menú pequeño con los
              // siete tipos, que es el orden que se espera: primero elegir, luego
              // aplicar.
              builder.addGroup("blocks", "Bloque").addItem("block-menu", {
                icon: BLOCK_MENU_TOOLBAR_ICON,
                label: "Tipo de texto",
                active: () => false,
                onRun: () => toggleBlockMenu(),
              });
              builder
                .addGroup("appearance", "Apariencia")
                .addItem("text-color", {
                  icon: TEXT_COLOR_TOOLBAR_ICON,
                  label: "Color de texto",
                  active: () => false,
                  onRun: () => openTextStylePicker(textColorInput),
                })
                .addItem("text-background", {
                  icon: TEXT_BACKGROUND_TOOLBAR_ICON,
                  label: "Fondo del texto",
                  active: () => false,
                  onRun: () => openTextStylePicker(textBackgroundInput),
                });
            },
          },
          [Crepe.Feature.ImageBlock]: {
            onUpload: async (file) => {
              try {
                const imported = await importImageForEditor(props.notePath, file);
                prepared.replacements.set(imported.dataUrl, imported.relativePath);
                if (imported.revision) prepared.revisions.set(imported.dataUrl, imported.revision);
                notifySuccess("Imagen insertada", file.name);
                return imported.dataUrl;
              } catch (error) {
                notifyError("No se pudo insertar la imagen", error);
                throw error;
              }
            },
            proxyDomURL: (url) => url,
          },
        },
      });
      instance.editor
        .use(textColorRemark)
        .use(textColorMark)
        .use(whiteboardNode)
        .use(whiteboardRemark)
        .use(textCursorTracker)
        .use(createWhiteboardView({
          onSave: async (svg, currentSrc, saveOptions) => {
            try {
              const file = new File([svg], "pizarra.svg", { type: "image/svg+xml" });
              const relativePath = prepared.replacements.get(currentSrc);
              const saved = relativePath && !saveOptions?.copy
                ? await updateAssetForEditor(
                    props.notePath,
                    relativePath,
                    file,
                    prepared.revisions.get(currentSrc),
                  )
                : await importImageForEditor(props.notePath, file);
              prepared.replacements.delete(currentSrc);
              prepared.revisions.delete(currentSrc);
              prepared.replacements.set(saved.dataUrl, saved.relativePath);
              if (saved.revision) prepared.revisions.set(saved.dataUrl, saved.revision);
              if (saveOptions?.notify !== false) {
                notifySuccess(relativePath ? "Pizarra actualizada" : "Pizarra guardada");
              }
              return saved.dataUrl;
            } catch (error) {
              notifyError("No se pudo guardar la pizarra", error);
              return null;
            }
          },
          onDeleteAsset: async (currentSrc) => {
            const relativePath = prepared.replacements.get(currentSrc);
            if (!relativePath) return;
            try {
              await deleteAssetForEditor(props.notePath, relativePath);
              prepared.replacements.delete(currentSrc);
              prepared.revisions.delete(currentSrc);
            } catch (error) {
              notifyError("No se pudo eliminar la pizarra", error);
              throw error;
            }
          },
        }));
      crepe = instance;
      await instance.create();
      if (disposed) {
        await instance.destroy();
        return;
      }
      instance.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (!disposed) props.onChange(serializeMarkdownFromEditor(markdown, prepared.replacements));
        });
      });
      props.onReady?.({
        focus() {
          instance.editor.ctx.get(editorViewCtx).focus();
        },
        setBlockType(type) {
          applyBlockType(type);
        },
        async insertWhiteboard(tool: DrawingTool) {
          await insertWhiteboard(tool);
        },
        async insertAsset(dataUrl, relativePath, alt = "Imagen", revision) {
          prepared.replacements.set(dataUrl, relativePath);
          if (revision) prepared.revisions.set(dataUrl, revision);
          const view = instance.editor.ctx.get(editorViewCtx);
          restoreTextCursor(view);
          const commands = instance.editor.ctx.get(commandsCtx);
          const node = imageBlockSchema.type(instance.editor.ctx).create({
            src: dataUrl,
            caption: alt,
            ratio: 1,
          });
          const inserted = commands.call(addBlockTypeCommand.key, { nodeType: node });
          if (!inserted) {
            await deleteAssetForEditor(props.notePath, relativePath).catch(() => undefined);
            prepared.replacements.delete(dataUrl);
            prepared.revisions.delete(dataUrl);
            throw new Error("No se pudo insertar el bloque de imagen");
          }
          createParagraphNear(view.state, view.dispatch);
          settleAfterInsertion(view);
        },
        insertAttachment(relativePath, label) {
          insertAttachmentLink(relativePath, label);
        },
      });
      setReady(true);
    } catch (cause) {
      if (!disposed) {
        const message = cause instanceof Error ? cause.message : "No se pudo iniciar el editor";
        setError(message);
        notifyError("No se pudo abrir el editor", message);
      }
    }
  });

  createEffect(() => {
    const token = props.reloadToken;
    if (token === lastReloadToken || !ready() || !crepe || disposed) return;
    lastReloadToken = token;
    void (async () => {
      try {
        if (!(await leaveEditor())) return;
        const next = await prepareMarkdownForEditor(props.notePath, props.initialValue);
        if (disposed || !crepe) return;
        prepared = next;
        crepe.editor.action(replaceAll(next.content));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se pudo recargar el contenido");
      }
    })();
  });

  createEffect(() => {
    if (!blockMenu()) return;
    const stop = watchBlockMenuDismissal();
    onCleanup(stop);
  });

  onCleanup(() => {
    disposed = true;
    closeBlockMenu();
    props.onDispose?.();
    if (crepe) void crepe.destroy();
  });

  return (
    <div class={styles.shell} data-x="editor">
      <div
        ref={(element) => (root = element)}
        class={styles.editor}
        data-x="editor-surface"
      >
        <Show when={blockMenu()}>
          {(placement) => (
            <div
              ref={(element) => (blockMenuPanel = element)}
              class={styles.blockMenu}
              data-x="block-menu"
              style={{ left: `${placement().left}px`, top: `${placement().top}px` }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeBlockMenu();
                  crepe?.editor.ctx.get(editorViewCtx).focus();
                }
              }}
            >
              <p class={styles.blockMenuTitle}>Tipo de texto</p>
              <div class={styles.blockMenuList} role="menu" aria-label="Tipos de texto">
                <For each={EDITOR_BLOCKS}>
                  {(item) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={activeBlock() === item.id}
                      class={`${styles.blockMenuItem} ${activeBlock() === item.id ? styles.blockMenuItemActive : ""}`}
                      onClick={() => {
                        closeBlockMenu();
                        applyBlockType(item.id);
                      }}
                    >
                      <span class={styles.blockMenuIcon} innerHTML={item.icon} />
                      {item.label}
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </Show>
      </div>
      <input
        ref={(element) => (textColorInput = element)}
        class="sr-only"
        type="color"
        value={DEFAULT_TEXT_COLOR}
        tabIndex={-1}
        aria-label="Color del texto seleccionado"
        onInput={(event) => applyTextStyleValue("color", event.currentTarget.value)}
      />
      <input
        ref={(element) => (textBackgroundInput = element)}
        class="sr-only"
        type="color"
        value={DEFAULT_TEXT_BACKGROUND}
        tabIndex={-1}
        aria-label="Fondo del texto seleccionado"
        onInput={(event) => applyTextStyleValue("background", event.currentTarget.value)}
      />
      <Show when={!ready() && !error()}>
        <div class={styles.loading} role="status">
          Preparando editor…
        </div>
      </Show>
      <Show when={error()}>
        {(message) => (
          <div class={`${styles.loading} ${styles.error}`} role="alert">
            {message()}
          </div>
        )}
      </Show>
    </div>
  );
}
