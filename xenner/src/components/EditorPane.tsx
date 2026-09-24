import { createSignal, onCleanup, onMount, Show } from "solid-js";

import { DrawingModal } from "./DrawingModal";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import {
  importImageForEditor,
  readAssetForEditor,
  updateAssetForEditor,
  type SelectedEditorAsset,
} from "../editor/assets";
import {
  ImageIcon,
  MarkdownIcon,
  NoteIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  ShapesIcon,
  TrashIcon,
} from "./Icons";
import { NOTE_TITLE_MAX_LENGTH } from "../workspace/note";
import type { NoteDocument, SaveStatus, VaultErrorShape } from "../workspace/types";

interface EditorPaneProps {
  document: NoteDocument | null;
  status: SaveStatus;
  initializing: boolean;
  loading: boolean;
  reloadToken: number;
  error: VaultErrorShape | null;
  onChange(body: string): void;
  onTitleChange(title: string): void;
  onCreate(): void;
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

export function EditorPane(props: EditorPaneProps) {
  const [drawingOpen, setDrawingOpen] = createSignal(false);
  const [editingDrawing, setEditingDrawing] = createSignal<SelectedEditorAsset | null>(null);
  const [drawingInitialSvg, setDrawingInitialSvg] = createSignal<string | undefined>(undefined);
  const [drawingBusy, setDrawingBusy] = createSignal(false);
  const [drawingError, setDrawingError] = createSignal<string | null>(null);
  const [imageBusy, setImageBusy] = createSignal(false);
  const [imageError, setImageError] = createSignal<string | null>(null);
  const [sourceMode, setSourceMode] = createSignal(false);
  const [insertMenuOpen, setInsertMenuOpen] = createSignal(false);
  let editorHandle: MarkdownEditorHandle | null = null;
  let imageInput: HTMLInputElement | undefined;
  let insertMenu: HTMLDivElement | undefined;
  let insertTrigger: HTMLButtonElement | undefined;

  onMount(() => {
    const closeMenuOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!insertMenu?.contains(target) && !insertTrigger?.contains(target)) {
        setInsertMenuOpen(false);
      }
    };
    const closeMenuWithEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setInsertMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenuOutside);
    document.addEventListener("keydown", closeMenuWithEscape);
    onCleanup(() => {
      document.removeEventListener("pointerdown", closeMenuOutside);
      document.removeEventListener("keydown", closeMenuWithEscape);
    });
  });

  function closeInsertMenu(): void {
    setInsertMenuOpen(false);
  }

  function chooseImage(): void {
    closeInsertMenu();
    imageInput?.click();
  }

  function startDrawing(): void {
    closeInsertMenu();
    setDrawingError(null);
    setEditingDrawing(null);
    setDrawingInitialSvg(undefined);
    setDrawingOpen(true);
  }

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
      setEditingDrawing(null);
      setDrawingInitialSvg(undefined);
      setDrawingOpen(false);
    } catch (error) {
      setDrawingError(error instanceof Error ? error.message : "No se pudo insertar el dibujo");
    } finally {
      setDrawingBusy(false);
    }
  }

  async function openDrawingEditor(): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || drawingBusy()) return;
    closeInsertMenu();
    const selected = editorHandle.getSelectedAsset();
    if (!selected || !selected.relativePath.toLowerCase().endsWith(".svg")) {
      setDrawingError("Selecciona un dibujo SVG dentro de la nota para editarlo");
      return;
    }
    setDrawingBusy(true);
    setDrawingError(null);
    try {
      const svg = await readAssetForEditor(document.path, selected.relativePath);
      setEditingDrawing(selected);
      setDrawingInitialSvg(svg);
      setDrawingOpen(true);
    } catch (error) {
      setDrawingError(error instanceof Error ? error.message : "No se pudo abrir el dibujo");
    } finally {
      setDrawingBusy(false);
    }
  }

  async function saveDrawing(svg: string): Promise<void> {
    const target = editingDrawing();
    if (!target) {
      await insertDrawing(svg);
      return;
    }
    const document = props.document;
    if (!document || !editorHandle || drawingBusy()) return;
    setDrawingBusy(true);
    setDrawingError(null);
    try {
      const file = new File([svg], "drawing.svg", { type: "image/svg+xml" });
      const updated = await updateAssetForEditor(document.path, target.relativePath, file);
      if (!editorHandle.replaceAsset(target.dataUrl, updated.dataUrl, target.relativePath)) {
        throw new Error("La selección del dibujo cambió; ciérralo y vuelve a intentarlo");
      }
      setEditingDrawing(null);
      setDrawingInitialSvg(undefined);
      setDrawingOpen(false);
    } catch (error) {
      setDrawingError(error instanceof Error ? error.message : "No se pudo actualizar el dibujo");
    } finally {
      setDrawingBusy(false);
    }
  }

  return (
    <main class="editor-pane" aria-label="Editor de nota">
      <Show
        when={props.document}
        fallback={
          <div class="editor-blank-state" aria-busy={props.initializing}>
            <Show when={!props.initializing}>
              <div class="editor-empty-state">
                <span class="empty-note-icon">
                  <NoteIcon />
                </span>
                <h1>Una nota, un archivo Markdown</h1>
                <p>Crea una nota desde el explorador para empezar a escribir.</p>
                <button type="button" class="button primary" onClick={props.onCreate}>
                  Nueva nota
                </button>
              </div>
            </Show>
          </div>
        }
      >
        {(document) => (
          <>
            <header class="document-header">
              <div class="document-heading">
                <input
                  class="note-title-input"
                  value={document().title}
                  placeholder="Sin título"
                  aria-label="Título de la nota"
                  maxlength={NOTE_TITLE_MAX_LENGTH}
                  spellcheck={false}
                  onInput={(event) => props.onTitleChange(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                />
              </div>
              <div class="document-actions">
                <button
                  type="button"
                  class="icon-button document-icon-button danger"
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
                <div class="editor-workspace">
                  <div
                    class="editor-scroll rich-editor-scroll"
                    classList={{ loading: props.loading }}
                    aria-busy={props.loading}
                  >
                    <Show
                      when={!sourceMode()}
                      fallback={
                        <textarea
                          class="source-editor"
                          aria-label={`Contenido Markdown de ${displayName(documentPath)}`}
                          spellcheck
                          value={props.document?.body ?? ""}
                          onInput={(event) => props.onChange(event.currentTarget.value)}
                        />
                      }
                    >
                      <MarkdownEditor
                        notePath={documentPath}
                        initialValue={props.document?.body ?? ""}
                        reloadToken={props.reloadToken}
                        onChange={props.onChange}
                        onReady={(handle) => {
                          editorHandle = handle;
                        }}
                      />
                    </Show>
                    <span class="sr-only">Editando {documentPath}</span>
                  </div>

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

                  <div class="editor-asset-dock" role="toolbar" aria-label="Acciones del editor">
                    <div class="asset-menu-anchor">
                      <button
                        ref={(element) => (insertTrigger = element)}
                        type="button"
                        class="asset-dock-button asset-add-button"
                        classList={{ open: insertMenuOpen(), busy: imageBusy() }}
                        aria-label="Insertar contenido"
                        aria-haspopup="menu"
                        aria-controls="editor-insert-menu"
                        aria-expanded={insertMenuOpen()}
                        title={imageBusy() ? "Procesando imagen" : "Insertar contenido"}
                        onClick={() => setInsertMenuOpen((open) => !open)}
                      >
                        <PlusIcon />
                      </button>
                      <Show when={insertMenuOpen()}>
                        <div
                          ref={(element) => (insertMenu = element)}
                          id="editor-insert-menu"
                          class="asset-menu"
                          role="menu"
                          aria-label="Insertar contenido"
                        >
                          <p>Insertar</p>
                          <button
                            type="button"
                            class="asset-menu-item"
                            role="menuitem"
                            disabled={props.loading || imageBusy() || sourceMode()}
                            onClick={chooseImage}
                          >
                            <span><ImageIcon /></span>
                            Imagen
                          </button>
                          <button
                            type="button"
                            class="asset-menu-item"
                            role="menuitem"
                            disabled={props.loading || drawingBusy() || sourceMode()}
                            onClick={startDrawing}
                          >
                            <span><ShapesIcon /></span>
                            Figura
                          </button>
                          <button
                            type="button"
                            class="asset-menu-item"
                            role="menuitem"
                            disabled={props.loading || drawingBusy() || sourceMode()}
                            onClick={() => void openDrawingEditor()}
                          >
                            <span><PencilIcon /></span>
                            Editar SVG
                          </button>
                        </div>
                      </Show>
                    </div>
                    <span class="asset-dock-separator" aria-hidden="true" />
                    <button
                      type="button"
                      class="asset-dock-button"
                      classList={{ busy: drawingBusy() }}
                      disabled={props.loading || drawingBusy() || sourceMode()}
                      aria-label="Añadir figura"
                      title="Añadir figura"
                      onClick={startDrawing}
                    >
                      <ShapesIcon />
                    </button>
                    <button
                      type="button"
                      class="asset-dock-button"
                      classList={{ active: sourceMode() }}
                      aria-label={sourceMode() ? "Volver a vista visual" : "Ver Markdown"}
                      aria-pressed={sourceMode()}
                      title={sourceMode() ? "Vista visual" : "Markdown"}
                      onClick={() => {
                        closeInsertMenu();
                        setSourceMode((value) => !value);
                      }}
                    >
                      <MarkdownIcon />
                    </button>
                    <span class="asset-dock-separator" aria-hidden="true" />
                    <span
                      class="save-state"
                      data-status={props.status}
                      role="status"
                      aria-label={statusLabel(props.status)}
                      title={`${statusLabel(props.status)} · ${new Date(document().updatedAt).toLocaleString("es")}`}
                      aria-live="polite"
                    >
                      <span class="sr-only">{statusLabel(props.status)}</span>
                    </span>
                  </div>
                </div>
              )}
            </Show>
          </>
        )}
      </Show>
      <Show when={drawingOpen()}>
        <DrawingModal
          initialSvg={drawingInitialSvg()}
          title={editingDrawing() ? "Editar dibujo" : "Nuevo dibujo"}
          submitLabel={editingDrawing() ? "Guardar cambios" : "Insertar dibujo"}
          onSave={saveDrawing}
          onClose={() => {
            setDrawingOpen(false);
            setEditingDrawing(null);
            setDrawingInitialSvg(undefined);
          }}
        />
      </Show>
    </main>
  );
}
