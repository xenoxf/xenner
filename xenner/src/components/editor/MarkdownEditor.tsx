import type { Crepe as CrepeInstance } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  addBlockTypeCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { createParagraphNear } from "@milkdown/kit/prose/commands";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose, replaceAll } from "@milkdown/kit/utils";
import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";

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
import type { MarkdownEditorHandle, PreparedMarkdown } from "../../types/editor";
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
  const [toolbarHover, setToolbarHover] = createSignal(false);
  let root: HTMLDivElement | undefined;
  let crepe: CrepeInstance | null = null;
  let toolbarHideTimer: ReturnType<typeof setTimeout> | null = null;
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

  function rememberTextCursor(view: EditorView): void {
    const { selection } = view.state;
    if (!(selection instanceof TextSelection)) return;
    if (!selection.$from.parent.isTextblock) return;
    textCursorPos = selection.from;
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
        view: () => ({
          update: (view) => {
            if (disposed) return;
            rememberTextCursor(view);
            // Sin selección no hay barra que revelar: se suba de golpe en vez de
            // esperar al temporizador, o aparecería sola al volver a seleccionar.
            if (view.state.selection.empty && toolbarHover()) {
              if (toolbarHideTimer) clearTimeout(toolbarHideTimer);
              toolbarHideTimer = null;
              setToolbarHover(false);
            }
          },
        }),
      }),
  );

  // --- Barra flotante de formato -------------------------------------------
  // Crepe la monta a 20 ms de seleccionar y la deja fija. Se oculta hasta que
  // el puntero pasa por encima del TEXTO SELECCIONADO, que es donde la gente
  // mira al terminar de seleccionar, y no sobre la propia barra, que es
  // invisible y nadie sabe que hay ahí.
  const TOOLBAR_LINGER_MS = 700;

  function selectionRect(): DOMRect | null {
    if (!crepe) return null;
    const view = crepe.editor.ctx.get(editorViewCtx);
    const { from, to } = view.state.selection;
    if (from === to) return null;
    try {
      // Caja envolvente de los dos extremos: una selección de varias líneas no
      // cabe en un solo rectángulo, pero su bounding box sí.
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const left = Math.min(start.left, end.left);
      const right = Math.max(start.right, end.right);
      const top = Math.min(start.top, end.top);
      const bottom = Math.max(start.bottom, end.bottom);
      return new DOMRect(left, top - 6, Math.max(right - left, 8), bottom - top + 12);
    } catch {
      return null;
    }
  }

  function isPointerOverToolbar(target: EventTarget | null): boolean {
    return target instanceof Element && Boolean(target.closest(".milkdown-toolbar"));
  }

  function hideToolbarSoon(): void {
    if (toolbarHideTimer) clearTimeout(toolbarHideTimer);
    // Al salir hay un hueco entre el texto y la barra; sin este margen la barra
    // desaparecería justo en mitad del trayecto y no secould clicar en ella.
    toolbarHideTimer = setTimeout(() => {
      toolbarHideTimer = null;
      setToolbarHover(false);
    }, TOOLBAR_LINGER_MS);
  }

  function onEditorPointerMove(event: PointerEvent): void {
    if (isPointerOverToolbar(event.target)) {
      if (toolbarHideTimer) clearTimeout(toolbarHideTimer);
      setToolbarHover(true);
      return;
    }
    const rect = selectionRect();
    const inside =
      rect !== null &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (inside) {
      if (toolbarHideTimer) clearTimeout(toolbarHideTimer);
      setToolbarHover(true);
      return;
    }
    hideToolbarSoon();
  }

  function onEditorPointerLeave(): void {
    hideToolbarSoon();
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
          const view = instance.editor.ctx.get(editorViewCtx);
          restoreTextCursor(view);
          const commands = instance.editor.ctx.get(commandsCtx);
          if (type === "paragraph") commands.call(turnIntoTextCommand.key);
          else if (type === "heading1") commands.call(wrapInHeadingCommand.key, 1);
          else if (type === "heading2") commands.call(wrapInHeadingCommand.key, 2);
          else if (type === "heading3") commands.call(wrapInHeadingCommand.key, 3);
          else if (type === "bullet") commands.call(wrapInBulletListCommand.key);
          else if (type === "ordered") commands.call(wrapInOrderedListCommand.key);
          else commands.call(wrapInBlockquoteCommand.key);
          view.focus();
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

  onCleanup(() => {
    disposed = true;
    if (toolbarHideTimer) clearTimeout(toolbarHideTimer);
    props.onDispose?.();
    if (crepe) void crepe.destroy();
  });

  return (
    <div class={styles.shell} data-x="editor">
      <div
        ref={(element) => (root = element)}
        class={styles.editor}
        data-x="editor-surface"
        data-toolbar={toolbarHover() ? "on" : "off"}
        onPointerMove={onEditorPointerMove}
        onPointerLeave={onEditorPointerLeave}
      />
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
