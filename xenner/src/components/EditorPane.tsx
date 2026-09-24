import { createSignal, Show } from "solid-js";

import { DrawingModal } from "./DrawingModal";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import { importImageForEditor } from "../editor/assets";
import { ImageIcon, NoteIcon, PencilIcon, RefreshIcon, TrashIcon } from "./Icons";
import type { NoteDocument, SaveStatus, VaultErrorShape } from "../workspace/types";

interface EditorPaneProps {
  document: NoteDocument | null;
  status: SaveStatus;
  loading: boolean;
  reloadToken: number;
  error: VaultErrorShape | null;
  onChange(content: string): void;
  onCreate(): void;
  onRename(): void;
  onDelete(): void;
  onRetry(): void;
  onReload(): void;
}

function statusLabel(status: SaveStatus): string {
  switch (status) {
    case "dirty":
      return "Cambios pendientes";
    case "saving":
      return "Guardando…";
    case "saved":
      return "Guardado";
    case "error":
      return "Error al guardar";
    case "conflict":
      return "Cambio externo";
    default:
      return "Sin cambios";
  }
}

function displayName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function breadcrumbs(path: string): string[] {
  return path.split("/");
}

export function EditorPane(props: EditorPaneProps) {
  const [drawingOpen, setDrawingOpen] = createSignal(false);
  const [drawingBusy, setDrawingBusy] = createSignal(false);
  const [drawingError, setDrawingError] = createSignal<string | null>(null);
  const [imageBusy, setImageBusy] = createSignal(false);
  const [imageError, setImageError] = createSignal<string | null>(null);
  const [sourceMode, setSourceMode] = createSignal(false);
  let editorHandle: MarkdownEditorHandle | null = null;
  let imageInput: HTMLInputElement | undefined;

  async function insertImage(file: File): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || imageBusy()) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const imported = await importImageForEditor(document.path, file);
      editorHandle.insertAsset(imported.dataUrl, imported.relativePath, file.name);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "No se pudo insertar la imagen");
    } finally {
      setImageBusy(false);
      if (imageInput) imageInput.value = "";
    }
  }

  async function insertDrawing(svg: string): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || drawingBusy()) return;
    setDrawingBusy(true);
    setDrawingError(null);
    try {
      const file = new File([svg], "drawing.svg", { type: "image/svg+xml" });
      const imported = await importImageForEditor(document.path, file);
      editorHandle.insertAsset(imported.dataUrl, imported.relativePath, "Dibujo");
      setDrawingOpen(false);
    } catch (error) {
      setDrawingError(error instanceof Error ? error.message : "No se pudo insertar el dibujo");
    } finally {
      setDrawingBusy(false);
    }
  }

  return (
    <main class="editor-pane" aria-label="Editor de nota">
      <Show
        when={props.document}
        fallback={
          <div class="editor-empty-state">
            <span class="empty-note-icon">
              <NoteIcon />
            </span>
            <h1>Una nota, un archivo Markdown</h1>
            <p>
              Crea una nota desde el explorador para empezar a escribir con formato enriquecido.
            </p>
            <button type="button" class="button primary" onClick={props.onCreate}>
              Crear primera nota
            </button>
          </div>
        }
      >
        {(document) => (
          <>
            <header class="document-header">
              <div class="document-heading">
                <div class="breadcrumbs" aria-label="Ubicación de la nota">
                  {breadcrumbs(document().path).map((part, index) => (
                    <span>
                      {index > 0 && <span class="breadcrumb-separator">/</span>}
                      {part}
                    </span>
                  ))}
                </div>
                <h1>{displayName(document().path)}</h1>
              </div>
              <div class="document-actions">
                <button
                  type="button"
                  class="button editor-mode-button"
                  aria-pressed={sourceMode()}
                  onClick={() => setSourceMode((value) => !value)}
                >
                  {sourceMode() ? "Visual" : "Markdown"}
                </button>
                <input
                  ref={(element) => (imageInput = element)}
                  class="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  aria-label="Seleccionar imagen"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void insertImage(file);
                  }}
                />
                <button
                  type="button"
                  class="button editor-image-button"
                  disabled={props.loading || imageBusy() || sourceMode()}
                  onClick={() => imageInput?.click()}
                >
                  <ImageIcon />
                  {imageBusy() ? "Importando…" : "Imagen"}
                </button>
                <button
                  type="button"
                  class="button editor-drawing-button"
                  disabled={props.loading || drawingBusy() || sourceMode()}
                  onClick={() => {
                    setDrawingError(null);
                    setDrawingOpen(true);
                  }}
                >
                  <PencilIcon />
                  {drawingBusy() ? "Guardando…" : "Dibujar"}
                </button>
                <span
                  class="save-state"
                  data-status={props.status}
                  role="status"
                  aria-live="polite"
                >
                  {statusLabel(props.status)}
                </span>
                <time dateTime={new Date(document().updatedAt).toISOString()}>
                  {new Date(document().updatedAt).toLocaleString("es")}
                </time>
                <button
                  type="button"
                  class="icon-button labelled"
                  aria-label="Renombrar nota"
                  title="Renombrar"
                  onClick={props.onRename}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  class="icon-button labelled danger"
                  aria-label="Eliminar nota"
                  title="Eliminar"
                  onClick={props.onDelete}
                >
                  <TrashIcon />
                </button>
              </div>
            </header>
            <Show when={props.error?.code === "conflict" || props.error?.code === "io"}>
              <div class="editor-alert" role="alert">
                <div>
                  <strong>{props.error?.code === "conflict" ? "Conflicto de archivo" : "No se pudo guardar"}</strong>
                  <span>{props.error?.message}</span>
                </div>
                <div class="alert-actions">
                  <button type="button" class="button" onClick={props.onRetry}>
                    Reintentar
                  </button>
                  <button type="button" class="button" onClick={props.onReload}>
                    <RefreshIcon /> Recargar
                  </button>
                </div>
              </div>
            </Show>
            <Show when={drawingError() || imageError()}>
              {(message) => <div class="editor-alert" role="alert">{message()}</div>}
            </Show>
            <Show when={props.document?.path} keyed>
              {(documentPath) => (
                <div class="editor-scroll rich-editor-scroll" classList={{ loading: props.loading }} aria-busy={props.loading}>
                  <Show
                    when={!sourceMode()}
                    fallback={
                      <textarea
                        class="source-editor"
                        aria-label={`Contenido Markdown de ${displayName(documentPath)}`}
                        spellcheck
                        value={props.document?.content ?? ""}
                        onInput={(event) => props.onChange(event.currentTarget.value)}
                      />
                    }
                  >
                    <MarkdownEditor
                      notePath={documentPath}
                      initialValue={props.document?.content ?? ""}
                      reloadToken={props.reloadToken}
                      onChange={props.onChange}
                      onReady={(handle) => {
                        editorHandle = handle;
                      }}
                    />
                  </Show>
                  <span class="sr-only">Editando {documentPath}</span>
                </div>
              )}
            </Show>
          </>
        )}
      </Show>
      <Show when={drawingOpen()}>
        <DrawingModal
          onSave={insertDrawing}
          onClose={() => setDrawingOpen(false)}
        />
      </Show>
    </main>
  );
}
