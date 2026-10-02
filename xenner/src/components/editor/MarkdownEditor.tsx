import type { Crepe as CrepeInstance } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import type { Ctx } from "@milkdown/kit/ctx";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose, replaceAll } from "@milkdown/kit/utils";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";

import { blockTypesInSelection } from "../../editor/block-type";
import {
  BLOCK_TYPE_ICONS,
  CREPE_BUTTON_LABELS,
  CREPE_FEATURE_KEYS,
  CREPE_FEATURES,
  CREPE_TEXT_LABELS,
  SLASH_GROUPS,
  TEXT_BACKGROUND_ICON,
  TEXT_COLOR_ICON,
  WHITEBOARD_ICON,
} from "../../editor/crepe-config";
import { createDrawingId, serializeDrawing } from "../../editor/drawing";
import {
  applyBlockType as runBlockCommand,
  focusTextCursor,
  insertAttachmentLink,
  insertBlock,
  prepareInsertionPoint,
} from "../../editor/editor-commands";
import {
  DEFAULT_TEXT_BACKGROUND,
  DEFAULT_TEXT_COLOR,
  normalizeTextColor,
  textColorMark,
  textColorRemark,
} from "../../editor/text-color";
import { whiteboardNode, whiteboardRemark } from "../../editor/whiteboard-node";
import {
  deleteAssetForEditor,
  importImageForEditor,
  prepareMarkdownForEditor,
  serializeMarkdownFromEditor,
  updateAssetForEditor,
} from "../../services/editorAssets";
import { leaveEditor } from "../../services/editorSession";
import { notifyError, notifySuccess } from "../../services/toastService";
import styles from "../../styles/components/MarkdownEditor.module.css";
import type { DrawingTool } from "../../types/drawing";
import type {
  EditorBlockType,
  MarkdownEditorHandle,
  PreparedMarkdown,
} from "../../types/editor";
import { createWhiteboardView } from "./WhiteboardNodeView";

/**
 * El editor: monta Crepe y le cablea lo que Xenner le añade.
 *
 * Este archivo **no decide nada**. Lo que se le enseña a la persona está en
 * `editor/crepe-config.ts` y lo que se hace con el documento, en
 * `editor/editor-commands.ts`. Aquí queda solo el pegamento: crear la
 * instancia, vigilar los cambios y exponer el handle que usa `EditorPane`.
 *
 * Esa división es lo que impide que un arreglo del botón `+` acabe tocando la
 * configuración del menú de enlaces, que es lo que pasaba cuando todo vivía
 * dentro del mismo `new Crepe({...})`.
 */

interface MarkdownEditorProps {
  notePath: string;
  initialValue: string;
  reloadToken: number;
  onChange(markdown: string): void;
  onReady?(handle: MarkdownEditorHandle): void;
  onDispose?(): void;
}

interface InsertAnchor {
  left: number;
  top: number;
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  /** Dónde va el `+` de insertar en la línea, en px sobre la raíz del editor. */
  const [insertAnchor, setInsertAnchor] = createSignal<InsertAnchor | null>(null);

  let root: HTMLDivElement | undefined;
  let crepe: CrepeInstance | null = null;
  let textColorInput: HTMLInputElement | undefined;
  let textBackgroundInput: HTMLInputElement | undefined;
  let disposed = false;
  let lastReloadToken = props.reloadToken;
  let prepared: PreparedMarkdown = {
    content: props.initialValue,
    replacements: new Map(),
    revisions: new Map(),
  };
  let insertWhiteboardCommand: ((tool: DrawingTool) => Promise<void>) | null = null;
  let insertingWhiteboard = false;
  /**
   * Última posición del cursor de TEXTO conocida. Insertar un bloque desde el
   * dock puede llegar con una selección de nodo, o sin que el editor tenga el
   * foco porque el botón está fuera del `contenteditable`. Sin esto el bloque
   * caía al final de la nota.
   */
  let lastTextPos: number | null = null;
  /** La selección del momento de abrir un diálogo del sistema, que roba el foco. */
  let selectionBeforeDialog: { from: number; to: number } | null = null;

  /**
   * Avisa de un fallo sin enterrarlo y sin dejar la vista a medias.
   *
   * Antes este archivo tuvo bloques `catch` sin cuerpo alrededor de todo lo
   * delicado. Eso es lo que escondió el fallo más difícil de depurar del
   * editor: al cambiar el tipo de un texto seleccionado, el texto desaparecía,
   * el editor dejaba de aceptar nada y al reabrir la nota todo estaba bien. Un
   * `catch` mudo se come justo la excepción que lo explica —una transacción a
   * medio hacer deja la vista a medias, el serializador de Markdown falla sobre
   * ese documento, no se guarda nada y ProseMirror se queda sin poder despachar.
   *
   * Un fallo se avisa por consola **y** se le dice a quien escribe: un
   * `console.error` no lo ve nadie, y un texto que desaparece sin explicación es
   * un callejón sin salida.
   */
  function reportFailure(what: string, error: unknown): void {
    console.error(`xenner: ${what}`, error);
    notifyError("No se pudo aplicar el formato", what);
  }

  function currentView(): EditorView | null {
    return crepe?.editor.ctx.get(editorViewCtx) ?? null;
  }

  // --- La posición del `+` ------------------------------------------------

  /**
   * El asa lateral solo con el cursor en un bloque de texto.
   *
   * Es la condición de Crepe menos las tablas, las citas y las fórmulas: dentro
   * de ellas no hay «la línea del cursor» sobre la que insertar. Se pasa como
   * `shouldShow` del `blockHandle` para que nuestro `+` y el tirador de arrastrar
   * aparezcan y desaparezcan **juntos**; si no, un `+` sin asa al lado parece un
   * botón suelto.
   */
  function canShowBlockHandle(view: EditorView): boolean {
    const { selection } = view.state;
    if (!(selection instanceof TextSelection) || !selection.$from.parent.isTextblock) return false;
    for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
      const name = selection.$from.node(depth).type.name;
      if (name === "table" || name === "blockquote" || name === "math_inline") return false;
    }
    return true;
  }

  /**
   * Coloca el `+` a la altura del cursor y a la izquierda del bloque, que es
   * donde Crepe pone su asa.
   *
   * Se mide con `coordsAtPos`, que es síncrono. Leer la posición del asa de
   * Crepe sería una carrera, porque `floating-ui` la aplica en un `then`.
   */
  function updateInsertAnchor(view: EditorView): void {
    if (!root || !canShowBlockHandle(view)) {
      setInsertAnchor(null);
      return;
    }
    try {
      const bounds = root.getBoundingClientRect();
      const caret = view.coordsAtPos(view.state.selection.from);
      const dom = view.domAtPos(view.state.selection.from).node;
      const element = dom instanceof HTMLElement ? dom : dom?.parentElement;
      const blockLeft = element
        ? element.getBoundingClientRect().left - bounds.left
        : bounds.left;
      // El mismo margen que el asa de Crepe (`getOffset`), más el ancho del
      // botón, para que los dos queden en paralelo.
      setInsertAnchor({ left: Math.max(4, blockLeft - 10 - 26), top: caret.top - bounds.top });
    } catch (error) {
      reportFailure("no se pudo colocar el botón de insertar", error);
      setInsertAnchor(null);
    }
  }

  function refreshInsertAnchor(): void {
    const view = currentView();
    if (!disposed && view) updateInsertAnchor(view);
  }

  /**
   * El `+` que inserta en la línea del cursor y abre el menú de tipos.
   *
   * El de Crepe inserta **siempre por debajo** del bloque: pulsarlo a media frase
   * partía el texto y además metía una línea de más delante de lo que se iba a
   * escribir. Su `onAdd` no es configurable, así que se sustituye por este y el
   * suyo se oculta por CSS. El tirador de arrastrar que va al lado sí funciona y
   * no se toca.
   *
   * El menú se abre escribiendo `/`, que es lo mismo que hace el menú slash al
   * teclearlo. Se usa ese camino y no el método interno de Crepe porque
   * `menuAPI` no está exportado: el único subpaquete público es el de la
   * feature entera, y ahí solo sale `blockEdit`.
   */
  function showInlineInsertMenu(): void {
    const view = currentView();
    if (!view || disposed) return;
    if (!view.hasFocus()) view.focus();
    if (prepareInsertionPoint(view, reportFailure) === null) return;
    // El `/` dispara la regla de entrada de Crepe, que abre el menú. Va en su
    // propia transacción para que la regla vea un estado limpio.
    view.dispatch(view.state.tr.insertText("/"));
  }

  // --- Seguimiento del cursor --------------------------------------------

  const textCursorTracker = $prose(
    () =>
      new Plugin({
        key: new PluginKey("xennerTextCursor"),
        view: () => ({
          update: (view) => {
            if (disposed) return;
            const { selection } = view.state;
            if (selection instanceof TextSelection && selection.$from.parent.isTextblock) {
              lastTextPos = selection.from;
            }
            updateInsertAnchor(view);
          },
        }),
      }),
  );

  // --- Color y fondo del texto -------------------------------------------

  /**
   * Los diálogos de color del sistema se llevan el foco, y con él la selección.
   *
   * Se guarda la selección **antes** de abrir el diálogo, porque para entonces
   * el editor ya está sin ella. Es el mismo problema que tenía el `+` antes, y
   * se resuelve igual: recordar en el momento del gesto, no intentar recuperarlo
   * después.
   */
  function openColorPicker(input: HTMLInputElement | undefined): void {
    const view = currentView();
    if (!input || !view) return;
    const { from, to } = view.state.selection;
    selectionBeforeDialog = from === to ? null : { from, to };
    input.click();
  }

  function applyTextStyle(target: "color" | "background", value: string): boolean {
    const view = currentView();
    if (!view) return false;
    const normalized = normalizeTextColor(value);
    if (!normalized) return false;
    const { from, to } = selectionBeforeDialog ?? view.state.selection;
    if (from === to) return false;
    try {
      const ctx = crepe!.editor.ctx;
      const markType = textColorMark.type(ctx);
      // Un color a la vez: el otro se lee de lo que ya hay puesto, para no
      // borrarlo al cambiar solo el fondo.
      let currentColor = "";
      let currentBackground = "";
      view.state.doc.nodesBetween(from, to, (node) => {
        if (!node.isText) return;
        const mark = node.marks.find((candidate) => candidate.type === markType);
        if (!mark) return;
        currentColor ||= normalizeTextColor(mark.attrs.color) ?? "";
        currentBackground ||= normalizeTextColor(mark.attrs.background) ?? "";
      });
      const attrs =
        target === "color"
          ? { color: normalized, background: currentBackground }
          : { color: currentColor, background: normalized };
      const transaction = view.state.tr.setSelection(
        TextSelection.create(view.state.doc, from, to),
      );
      transaction.removeMark(from, to, markType);
      if (attrs.color || attrs.background) {
        transaction.addMark(from, to, markType.create(attrs));
      }
      view.dispatch(transaction.scrollIntoView());
      view.focus();
      selectionBeforeDialog = null;
      return true;
    } catch (error) {
      reportFailure("no se pudo aplicar el color", error);
      return false;
    }
  }

  // --- Montaje ------------------------------------------------------------

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
      const ctx = (): Ctx => instance.editor.ctx;

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
          const view = currentView();
          if (!view) throw new Error("El editor no está listo");
          // La importación del asset es async: el cursor puede haberse movido,
          // así que se recoloca en el texto conocido justo antes de insertar.
          focusTextCursor(view, lastTextPos, reportFailure);
          const inserted = insertBlock(
            ctx(),
            view,
            whiteboardNode.type(ctx()),
            { src: imported.dataUrl, tool, draft: true, drawingId },
            reportFailure,
          );
          if (!inserted) throw new Error("No se pudo insertar la pizarra");
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
          [Crepe.Feature.AI]: CREPE_FEATURES[CREPE_FEATURE_KEYS.AI],
          [Crepe.Feature.TopBar]: CREPE_FEATURES[CREPE_FEATURE_KEYS.TopBar],
          [Crepe.Feature.BlockEdit]: CREPE_FEATURES[CREPE_FEATURE_KEYS.BlockEdit],
          [Crepe.Feature.ImageBlock]: CREPE_FEATURES[CREPE_FEATURE_KEYS.ImageBlock],
        },
        featureConfigs: {
          [Crepe.Feature.BlockEdit]: {
            blockHandle: {
              root,
              getOffset: () => 10,
              // El `+` del asa de Crepe se sustituye por el nuestro, que
              // inserta en la línea del cursor. Se oculta por CSS.
              shouldShow: () => {
                const view = currentView();
                return view ? canShowBlockHandle(view) : false;
              },
            },
            slashMenu: { root, offset: 8 },
            textGroup: SLASH_GROUPS.text,
            listGroup: SLASH_GROUPS.list,
            advancedGroup: SLASH_GROUPS.advanced,
            buildMenu(builder) {
              builder.addGroup("media", "Medio").addItem("whiteboard", {
                icon: WHITEBOARD_ICON,
                label: "Pizarra",
                onRun: () => {
                  void insertWhiteboardCommand?.("pen").catch((error) => {
                    notifyError("No se pudo crear la pizarra", error);
                  });
                },
              });
            },
          },
          [Crepe.Feature.Placeholder]: CREPE_TEXT_LABELS.placeholder,
          [Crepe.Feature.LinkTooltip]: CREPE_TEXT_LABELS.link,
          [Crepe.Feature.CodeMirror]: CREPE_TEXT_LABELS.codeMirror,
          [Crepe.Feature.Toolbar]: {
            boldLabel: CREPE_BUTTON_LABELS.bold,
            italicLabel: CREPE_BUTTON_LABELS.italic,
            strikethroughLabel: CREPE_BUTTON_LABELS.strikethrough,
            codeLabel: CREPE_BUTTON_LABELS.code,
            latexLabel: CREPE_BUTTON_LABELS.latex,
            linkLabel: CREPE_BUTTON_LABELS.link,
            buildToolbar(builder) {
              // El tipo de bloque va en la MISMA barra flotante que el formato.
              // Dos menús para lo mismo obligaban a decidir cuál era el bueno.
              // Nació de un bug real: Crepe no pone ningún botón que cambie el
              // tipo de bloque, así que el tipo solo se podía cambiar con el
              // cursor en una línea.
              const blocks = builder.addGroup("blocks", "Tipo de texto");
              for (const item of BLOCK_TYPE_ICONS) {
                blocks.addItem(`block-${item.id}`, {
                  icon: item.icon,
                  label: item.label,
                  active: (activeCtx) => {
                    const view = activeCtx.get(editorViewCtx);
                    const { selection } = view.state;
                    return blockTypesInSelection(
                      view.state.doc,
                      selection.from,
                      selection.to,
                    ).has(item.id);
                  },
                  onRun: () => runBlockCommand(ctx(), item.id as EditorBlockType, reportFailure),
                });
              }
              builder
                .addGroup("appearance", "Apariencia")
                .addItem("text-color", {
                  icon: TEXT_COLOR_ICON,
                  label: "Color de texto",
                  active: () => false,
                  onRun: () => openColorPicker(textColorInput),
                })
                .addItem("text-background", {
                  icon: TEXT_BACKGROUND_ICON,
                  label: "Fondo del texto",
                  active: () => false,
                  onRun: () => openColorPicker(textBackgroundInput),
                });
            },
          },
          [Crepe.Feature.ImageBlock]: {
            ...CREPE_TEXT_LABELS.image,
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
        .use(
          createWhiteboardView({
            onSave: async (svg, currentSrc, saveOptions) => {
              try {
                const file = new File([svg], "pizarra.svg", { type: "image/svg+xml" });
                const relativePath = prepared.replacements.get(currentSrc);
                const saved =
                  relativePath && !saveOptions?.copy
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
          }),
        );
      crepe = instance;
      await instance.create();
      if (disposed) {
        await instance.destroy();
        return;
      }
      // El `+` va anclado al bloque, así que tiene que moverse con el scroll: si
      // no, se queda clavado donde estaba el bloque al desplazarse el texto.
      const surface = root.querySelector<HTMLElement>(".ProseMirror") ?? root;
      surface.addEventListener("scroll", refreshInsertAnchor, { passive: true });
      window.addEventListener("resize", refreshInsertAnchor);
      onCleanup(() => {
        surface.removeEventListener("scroll", refreshInsertAnchor);
        window.removeEventListener("resize", refreshInsertAnchor);
      });
      instance.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
          if (disposed) return;
          props.onChange(serializeMarkdownFromEditor(markdown, prepared.replacements));
        });
      });
      props.onReady?.({
        focus() {
          currentView()?.focus();
        },
        async insertWhiteboard(tool: DrawingTool) {
          await insertWhiteboard(tool);
        },
        async insertAsset(dataUrl, relativePath, alt = "Imagen", revision) {
          prepared.replacements.set(dataUrl, relativePath);
          if (revision) prepared.revisions.set(dataUrl, revision);
          const view = currentView();
          if (!view) {
            await deleteAssetForEditor(props.notePath, relativePath).catch(() => undefined);
            throw new Error("El editor no está listo");
          }
          focusTextCursor(view, lastTextPos, reportFailure);
          const inserted = insertBlock(
            ctx(),
            view,
            imageBlockSchema.type(ctx()),
            { src: dataUrl, caption: alt, ratio: 1 },
            reportFailure,
          );
          if (!inserted) {
            await deleteAssetForEditor(props.notePath, relativePath).catch(() => undefined);
            prepared.replacements.delete(dataUrl);
            prepared.revisions.delete(dataUrl);
          }
        },
        insertAttachment(relativePath, label) {
          const view = currentView();
          if (view) insertAttachmentLink(ctx(), view, relativePath, label, reportFailure);
        },
      });
      setReady(true);
    } catch (cause) {
      if (!disposed) {
        setError(cause instanceof Error ? cause.message : "No se pudo iniciar el editor");
        notifyError("No se pudo abrir el editor", cause instanceof Error ? cause.message : "");
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

  onCleanup(() => {
    disposed = true;
    setInsertAnchor(null);
    props.onDispose?.();
    if (crepe) void crepe.destroy();
  });

  return (
    <div class={styles.shell} data-x="editor">
      <div ref={(element) => (root = element)} class={styles.editor} data-x="editor-surface">
        <Show when={insertAnchor()}>
          {(anchor) => (
            <button
              type="button"
              class={styles.inlineInsert}
              data-x="inline-insert"
              style={{ left: `${anchor().left}px`, top: `${anchor().top}px` }}
              aria-label="Insertar aquí y elegir tipo"
              title="Insertar aquí y elegir tipo"
              // Sin esto el botón roba el foco al `contenteditable` y el lugar de
              // inserción se pierde antes de insertar. El gesto va en
              // `pointerdown` por la misma razón que en el dock.
              onPointerDown={(event) => {
                event.preventDefault();
                showInlineInsertMenu();
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
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
        onInput={(event) => applyTextStyle("color", event.currentTarget.value)}
      />
      <input
        ref={(element) => (textBackgroundInput = element)}
        class="sr-only"
        type="color"
        value={DEFAULT_TEXT_BACKGROUND}
        tabIndex={-1}
        aria-label="Fondo del texto seleccionado"
        onInput={(event) => applyTextStyle("background", event.currentTarget.value)}
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