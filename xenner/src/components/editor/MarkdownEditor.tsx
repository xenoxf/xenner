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
import { replaceAll } from "@milkdown/kit/utils";
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
import { createDrawingId, serializeDrawing } from "../../editor/drawing";
import { DEFAULT_TEXT_COLOR, normalizeTextColor, textColorMark, textColorRemark } from "../../editor/text-color";
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
    <path d="M5 5h14M12 5v9M8.5 18h7M6.5 15.5h11" />
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
  let root: HTMLDivElement | undefined;
  let crepe: CrepeInstance | null = null;
  let textColorInput: HTMLInputElement | undefined;
  let disposed = false;
  let lastReloadToken = props.reloadToken;
  let prepared: PreparedMarkdown = {
    content: props.initialValue,
    replacements: new Map(),
    revisions: new Map(),
  };
  let insertWhiteboardCommand: ((tool: DrawingTool) => Promise<void>) | null = null;
  let insertingWhiteboard = false;

  function applyTextColorValue(value: string): boolean {
    if (!crepe) return false;
    const normalized = normalizeTextColor(value);
    if (!normalized) return false;
    const view = crepe.editor.ctx.get(editorViewCtx);
    const { from, to } = view.state.selection;
    if (from === to) return false;
    const markType = textColorMark.type(crepe.editor.ctx);
    const transaction = view.state.tr.removeMark(from, to, markType);
    transaction.addMark(from, to, markType.create({ color: normalized }));
    view.dispatch(transaction.scrollIntoView());
    view.focus();
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
          const commands = instance.editor.ctx.get(commandsCtx);
          const inserted = commands.call(addBlockTypeCommand.key, { nodeType: node });
          if (!inserted) throw new Error("No se pudo insertar el bloque de pizarra");
          const view = instance.editor.ctx.get(editorViewCtx);
          createParagraphNear(view.state, view.dispatch);
          view.focus();
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
              builder.addGroup("appearance", "Apariencia").addItem("text-color", {
                icon: TEXT_COLOR_TOOLBAR_ICON,
                label: "Color de texto",
                active: () => false,
                onRun: () => textColorInput?.click(),
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
          const commands = instance.editor.ctx.get(commandsCtx);
          if (type === "paragraph") commands.call(turnIntoTextCommand.key);
          else if (type === "heading1") commands.call(wrapInHeadingCommand.key, 1);
          else if (type === "heading2") commands.call(wrapInHeadingCommand.key, 2);
          else if (type === "bullet") commands.call(wrapInBulletListCommand.key);
          else if (type === "ordered") commands.call(wrapInOrderedListCommand.key);
          else commands.call(wrapInBlockquoteCommand.key);
          instance.editor.ctx.get(editorViewCtx).focus();
        },
        async insertWhiteboard(tool: DrawingTool) {
          await insertWhiteboard(tool);
        },
        async insertAsset(dataUrl, relativePath, alt = "Imagen", revision) {
          prepared.replacements.set(dataUrl, relativePath);
          if (revision) prepared.revisions.set(dataUrl, revision);
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
          const view = instance.editor.ctx.get(editorViewCtx);
          createParagraphNear(view.state, view.dispatch);
          view.focus();
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
    props.onDispose?.();
    if (crepe) void crepe.destroy();
  });

  return (
    <div class={styles.shell}>
      <div ref={(element) => (root = element)} class={styles.editor} />
      <input
        ref={(element) => (textColorInput = element)}
        class="sr-only"
        type="color"
        value={DEFAULT_TEXT_COLOR}
        tabIndex={-1}
        aria-label="Color del texto seleccionado"
        onInput={(event) => applyTextColorValue(event.currentTarget.value)}
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
