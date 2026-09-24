import type { Crepe as CrepeInstance } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { createParagraphNear, splitBlock } from "@milkdown/kit/prose/commands";
import { insert, replaceAll } from "@milkdown/kit/utils";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";

import {
  importImageForEditor,
  prepareMarkdownForEditor,
  serializeMarkdownFromEditor,
  type PreparedMarkdown,
  type SelectedEditorAsset,
} from "../editor/assets";
import { DEFAULT_TEXT_COLOR, normalizeTextColor, textColorMark, textColorRemark } from "../editor/text-color";
import { notifyError, notifySuccess } from "./ToastRegion";

const TEXT_COLOR_TOOLBAR_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 5h14M12 5v9M8.5 18h7M6.5 15.5h11" />
  </svg>
`;

export type EditorBlockType = "paragraph" | "heading1" | "heading2" | "bullet" | "ordered" | "quote";

export interface MarkdownEditorHandle {
  focus(): void;
  insertTextBlock(): void;
  setBlockType(type: EditorBlockType): void;
  insertAsset(dataUrl: string, relativePath: string, alt?: string): void;
  getSelectedAsset(): SelectedEditorAsset | null;
  replaceAsset(
    previousDataUrl: string,
    nextDataUrl: string,
    relativePath: string,
  ): boolean;
}

type ImageNode = {
  type: { name: string };
  attrs: Record<string, unknown>;
};

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
  let prepared: PreparedMarkdown = { content: props.initialValue, replacements: new Map() };

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
      const instance = new Crepe({
        root,
        defaultValue: prepared.content,
        features: {
          [Crepe.Feature.AI]: false,
          [Crepe.Feature.TopBar]: false,
          [Crepe.Feature.BlockEdit]: false,
          [Crepe.Feature.ImageBlock]: true,
        },
        featureConfigs: {
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
      instance.editor.use(textColorRemark).use(textColorMark);
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
      const isImageNode = (value: unknown): value is ImageNode => {
        if (!value || typeof value !== "object") return false;
        const candidate = value as { type?: { name?: unknown }; attrs?: unknown };
        return (
          (candidate.type?.name === "image" || candidate.type?.name === "image-block") &&
          !!candidate.attrs &&
          typeof candidate.attrs === "object"
        );
      };

      const findImage = (source?: string): { position: number; node: ImageNode } | null => {
        const view = instance.editor.ctx.get(editorViewCtx);
        const state = view.state;
        const selection = state.selection as typeof state.selection & { node?: unknown };
        const from = selection.$from;
        const candidates: Array<{ position: number; node: unknown }> = [
          { position: selection.from, node: selection.node },
        ];
        if (from.nodeAfter) candidates.push({ position: selection.from, node: from.nodeAfter });
        if (from.nodeBefore) {
          candidates.push({ position: selection.from - from.nodeBefore.nodeSize, node: from.nodeBefore });
        }
        for (const candidate of candidates) {
          if (isImageNode(candidate.node)) {
            if (!source || candidate.node.attrs.src === source) {
              return { position: candidate.position, node: candidate.node };
            }
          }
        }
        if (source) {
          let match: { position: number; node: ImageNode } | null = null;
          state.doc.descendants((node, position) => {
            if (isImageNode(node) && node.attrs.src === source) {
              match = { position, node };
              return false;
            }
            return !match;
          });
          return match;
        }
        return null;
      };

      props.onReady?.({
        focus() {
          instance.editor.ctx.get(editorViewCtx).focus();
        },
        insertTextBlock() {
          const view = instance.editor.ctx.get(editorViewCtx);
          const dispatch = (transaction: Parameters<typeof view.dispatch>[0]) => view.dispatch(transaction);
          const inserted = splitBlock(view.state, dispatch) || createParagraphNear(view.state, dispatch);
          if (inserted) view.focus();
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
        insertAsset(dataUrl, relativePath, alt = "Dibujo") {
          prepared.replacements.set(dataUrl, relativePath);
          const view = instance.editor.ctx.get(editorViewCtx);
          if (!view.hasFocus()) view.focus();
          instance.editor.action(insert(`![${alt}](${dataUrl})`));
        },
        getSelectedAsset() {
          const target = findImage();
          if (!target || typeof target.node.attrs.src !== "string") return null;
          const dataUrl = target.node.attrs.src;
          const relativePath = prepared.replacements.get(dataUrl);
          if (!relativePath) return null;
          const alt =
            typeof target.node.attrs.alt === "string"
              ? target.node.attrs.alt
              : typeof target.node.attrs.caption === "string"
                ? target.node.attrs.caption
                : undefined;
          return { dataUrl, relativePath, alt };
        },
        replaceAsset(previousDataUrl, nextDataUrl, relativePath) {
          const target = findImage(previousDataUrl);
          if (!target) return false;
          prepared.replacements.delete(previousDataUrl);
          prepared.replacements.set(nextDataUrl, relativePath);
          const view = instance.editor.ctx.get(editorViewCtx);
          view.dispatch(view.state.tr.setNodeAttribute(target.position, "src", nextDataUrl));
          return true;
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
    <div class="markdown-editor-shell">
      <div ref={(element) => (root = element)} class="markdown-editor" />
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
        <div class="editor-loading" role="status">
          Preparando editor…
        </div>
      </Show>
      <Show when={error()}>
        {(message) => (
          <div class="editor-loading editor-error" role="alert">
            {message()}
          </div>
        )}
      </Show>
    </div>
  );
}
