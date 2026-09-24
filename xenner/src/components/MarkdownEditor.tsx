import type { Crepe as CrepeInstance } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { insert, replaceAll } from "@milkdown/kit/utils";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";

import {
  importImageForEditor,
  prepareMarkdownForEditor,
  serializeMarkdownFromEditor,
  type PreparedMarkdown,
  type SelectedEditorAsset,
} from "../editor/assets";

export interface MarkdownEditorHandle {
  focus(): void;
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
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  const [ready, setReady] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let root: HTMLDivElement | undefined;
  let crepe: CrepeInstance | null = null;
  let disposed = false;
  let lastReloadToken = props.reloadToken;
  let prepared: PreparedMarkdown = { content: props.initialValue, replacements: new Map() };

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
          [Crepe.Feature.ImageBlock]: true,
        },
        featureConfigs: {
          [Crepe.Feature.Placeholder]: {
            text: "Escribe tu nota…",
            mode: "doc",
          },
          [Crepe.Feature.BlockEdit]: {
            advancedGroup: {
              image: null,
            },
          },
          [Crepe.Feature.ImageBlock]: {
            onUpload: async (file) => {
              const imported = await importImageForEditor(props.notePath, file);
              prepared.replacements.set(imported.dataUrl, imported.relativePath);
              return imported.dataUrl;
            },
            proxyDomURL: (url) => url,
          },
        },
      });
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
        insertAsset(dataUrl, relativePath, alt = "Dibujo") {
          prepared.replacements.set(dataUrl, relativePath);
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
        setError(cause instanceof Error ? cause.message : "No se pudo iniciar el editor");
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
    if (crepe) void crepe.destroy();
  });

  return (
    <div class="markdown-editor-shell">
      <div ref={(element) => (root = element)} class="markdown-editor" />
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
