import type { Crepe as CrepeInstance } from "@milkdown/crepe";
import { insert, replaceAll } from "@milkdown/kit/utils";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";

import {
  importImageForEditor,
  prepareMarkdownForEditor,
  serializeMarkdownFromEditor,
  type PreparedMarkdown,
} from "../editor/assets";

export interface MarkdownEditorHandle {
  insertAsset(dataUrl: string, relativePath: string, alt?: string): void;
}

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
      props.onReady?.({
        insertAsset(dataUrl, relativePath, alt = "Dibujo") {
          prepared.replacements.set(dataUrl, relativePath);
          instance.editor.action(insert(`![${alt}](${dataUrl})`));
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
