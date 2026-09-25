import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import {
  chooseImageForEditor,
  editorSupportsNativeImagePicker,
  importImageForEditor,
} from "../../services/editorAssets";
import { notifyError, notifySuccess } from "../../services/toastService";
import {
  getActiveWhiteboard,
  getEditorMode,
  setEditorMode,
} from "../../services/editorSession";
import styles from "../../styles/components/EditorPane.module.css";
import type { DrawingTool } from "../../types/drawing";
import type { EditorBlockType, MarkdownEditorHandle } from "../../types/editor";
import type {
  NoteDocument,
  SaveStatus,
  VaultErrorShape,
} from "../../types/workspace";
import { baseName } from "../../utils/paths";
import { NOTE_TITLE_MAX_LENGTH } from "../../workspace/note";
import { Button } from "../ui/Button";
import { NoteIcon, RefreshIcon } from "../ui/Icons";
import { EditorToolbar } from "./EditorToolbar";
import { MarkdownEditor } from "./MarkdownEditor";

export interface EditorPaneProps {
  document: NoteDocument | null;
  status: SaveStatus;
  initializing: boolean;
  loading: boolean;
  reloadToken: number;
  error: VaultErrorShape | null;
  onChange(body: string): void;
  onTitleChange(title: string): void | boolean | Promise<void | boolean>;
  onCreate(): void;
  onRetry(): void;
  onReload(): void;
}

function visibleStatus(status: SaveStatus): string {
  const whiteboard = getActiveWhiteboard();
  if (whiteboard?.dirty) return whiteboard.saving ? "Guardando pizarra…" : "Cambios en pizarra";
  return statusLabel(status);
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

export function EditorPane(props: EditorPaneProps) {
  const [imageBusy, setImageBusy] = createSignal(false);
  const [editorReady, setEditorReady] = createSignal(false);
  const [whiteboardBusy, setWhiteboardBusy] = createSignal(false);
  const [titleDraft, setTitleDraft] = createSignal("");
  let editorHandle: MarkdownEditorHandle | null = null;
  let imageInput: HTMLInputElement | undefined;
  let lastDocumentPath: string | undefined;
  let lastDocumentTitle: string | undefined;
  let titleCommitTask: Promise<void> = Promise.resolve();
  let titleTimer: ReturnType<typeof setTimeout> | null = null;

  createEffect(() => {
    const document = props.document;
    if (!document) {
      lastDocumentPath = undefined;
      lastDocumentTitle = undefined;
      return;
    }
    if (document.path === lastDocumentPath && document.title === lastDocumentTitle) {
      return;
    }
    lastDocumentPath = document.path;
    lastDocumentTitle = document.title;
    setTitleDraft(document.title);
  });

  function clearTitleTimer(): void {
    if (!titleTimer) return;
    clearTimeout(titleTimer);
    titleTimer = null;
  }

  function commitTitle(): Promise<void> {
    const documentPath = props.document?.path;
    const task = titleCommitTask.then(async () => {
      if (!documentPath || props.document?.path !== documentPath) return;
      const currentTitle = props.document?.title ?? "";
      const nextTitle = titleDraft().trim().replace(/\.md$/i, "").trim();
      if (!nextTitle) {
        setTitleDraft(currentTitle);
        return;
      }
      if (nextTitle === currentTitle) {
        setTitleDraft(currentTitle);
        return;
      }

      try {
        const result = await props.onTitleChange(nextTitle);
        if (result === false) setTitleDraft(currentTitle);
        else setTitleDraft(nextTitle);
      } catch {
        setTitleDraft(currentTitle);
      }
    });
    titleCommitTask = task.catch(() => undefined);
    return task;
  }

  function scheduleTitleCommit(): void {
    clearTitleTimer();
    titleTimer = setTimeout(() => {
      titleTimer = null;
      void commitTitle();
    }, 500);
  }

  onCleanup(clearTitleTimer);

  function applyBlockType(type: EditorBlockType): void {
    if (!editorHandle || !editorReady() || props.loading) return;
    editorHandle.setBlockType(type);
    editorHandle.focus();
  }

  async function chooseImage(): Promise<void> {
    const document = props.document;
    if (!document || imageBusy() || !editorReady()) return;
    if (!editorSupportsNativeImagePicker()) {
      imageInput?.click();
      return;
    }

    setImageBusy(true);
    try {
      const imported = await chooseImageForEditor(document.path);
      if (!imported || !editorHandle) return;
      await editorHandle.insertAsset(
        imported.dataUrl,
        imported.relativePath,
        imported.fileName,
        imported.revision,
      );
      notifySuccess("Imagen insertada", imported.fileName);
    } catch (error) {
      notifyError("No se pudo insertar la imagen", error);
    } finally {
      setImageBusy(false);
    }
  }

  async function insertWhiteboard(tool: DrawingTool): Promise<void> {
    if (!editorHandle || !editorReady() || props.loading || whiteboardBusy()) return;
    setWhiteboardBusy(true);
    try {
      await editorHandle.insertWhiteboard(tool);
    } catch (error) {
      notifyError("No se pudo crear la pizarra", error);
    } finally {
      setWhiteboardBusy(false);
    }
  }

  async function insertImage(file: File): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || imageBusy() || !editorReady()) return;
    setImageBusy(true);
    try {
      const imported = await importImageForEditor(document.path, file);
      await editorHandle.insertAsset(
        imported.dataUrl,
        imported.relativePath,
        file.name,
        imported.revision,
      );
      notifySuccess("Imagen insertada", file.name);
    } catch (error) {
      notifyError("No se pudo insertar la imagen", error);
    } finally {
      setImageBusy(false);
      if (imageInput) imageInput.value = "";
    }
  }

  function imageFileFromDataTransfer(data: DataTransfer | null): File | null {
    const file = [...(data?.files ?? [])].find((candidate) => candidate.type.startsWith("image/"));
    return file ?? null;
  }

  function handleImageDrop(event: DragEvent): void {
    const file = imageFileFromDataTransfer(event.dataTransfer);
    if (!file) return;
    event.preventDefault();
    if (getEditorMode() === "whiteboard") return;
    void insertImage(file);
  }

  function handlePaste(event: ClipboardEvent): void {
    if (getEditorMode() === "whiteboard") return;
    const file = [...(event.clipboardData?.files ?? [])].find((candidate) => candidate.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    void insertImage(file);
  }

  return (
    <main class={styles.pane} aria-label="Editor de nota">
      <Show
        when={props.document}
        fallback={
          <div class={styles.blankState} aria-busy={props.initializing}>
            <Show when={!props.initializing}>
              <div class={styles.emptyState}>
                <span class={styles.emptyIcon}><NoteIcon /></span>
                <h1>Una nota para escribir</h1>
                <p>Crea una nota desde el explorador para empezar.</p>
                <Button variant="primary" onClick={props.onCreate}>Nueva nota</Button>
              </div>
            </Show>
          </div>
        }
      >
        {(_document) => (
          <Show when={props.document?.path} keyed>
            {(documentPath) => (
              <div
                class={styles.workspace}
                onDragOver={(event) => {
                  if (imageFileFromDataTransfer(event.dataTransfer)) event.preventDefault();
                }}
                onDrop={handleImageDrop}
                onPaste={handlePaste}
              >
                <div
                  class={`${styles.scroll} ${props.loading ? styles.loading : ""}`}
                  aria-busy={props.loading}
                >
                  <div class={styles.documentColumn}>
                    <div class={styles.heading}>
                      <div class={styles.headingMeta}>
                        <span>{baseName(documentPath)}</span>
                        <span class={styles.saveStatus} role="status" aria-live="polite">
                          {visibleStatus(props.status)}
                        </span>
                      </div>
                      <input
                        class={styles.titleInput}
                        value={titleDraft()}
                        placeholder="Título"
                        aria-label="Nombre y título de la nota"
                        maxlength={NOTE_TITLE_MAX_LENGTH}
                        spellcheck={false}
                        onInput={(event) => {
                           setTitleDraft(event.currentTarget.value);
                           scheduleTitleCommit();
                         }}
                        onBlur={() => {
                           clearTitleTimer();
                           void commitTitle();
                         }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            clearTitleTimer();
                            setTitleDraft(props.document?.title ?? "");
                            event.currentTarget.blur();
                            return;
                          }
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          clearTitleTimer();
                          void commitTitle().then(() => editorHandle?.focus());
                        }}
                      />
                    </div>
                    <Show when={props.error?.code === "conflict" || props.error?.code === "io"}>
                      <div class={styles.alert} role="group" aria-label="Error de guardado">
                        <div>
                          <strong>{props.error?.code === "conflict" ? "Conflicto de archivo" : "No se pudo guardar"}</strong>
                          <span>{props.error?.message}</span>
                        </div>
                        <div class={styles.alertActions}>
                          <Button onClick={props.onRetry}>Reintentar</Button>
                          <Button onClick={props.onReload}>
                            <RefreshIcon /> Recargar
                          </Button>
                        </div>
                      </div>
                    </Show>
                    <MarkdownEditor
                      notePath={documentPath}
                      initialValue={props.document?.body ?? ""}
                      reloadToken={props.reloadToken}
                      onChange={props.onChange}
                      onReady={(handle) => {
                        editorHandle = handle;
                        setEditorReady(true);
                        setEditorMode("text");
                      }}
                      onDispose={() => {
                        editorHandle = null;
                        setEditorReady(false);
                      }}
                    />
                    <span class="sr-only">Editando {documentPath}</span>
                  </div>
                </div>

                <input
                  ref={(element) => (imageInput = element)}
                  class="sr-only"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  aria-label="Seleccionar imagen"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void insertImage(file);
                  }}
                />

                <Show when={getEditorMode() !== "whiteboard"}>
                  <EditorToolbar
                    loading={props.loading}
                    ready={editorReady()}
                    imageBusy={imageBusy()}
                    whiteboardBusy={whiteboardBusy()}
                    status={statusLabel(props.status)}
                    onApplyBlock={applyBlockType}
                    onChooseImage={() => void chooseImage()}
                    onInsertWhiteboard={(tool) => void insertWhiteboard(tool)}
                  />
                </Show>
              </div>
            )}
          </Show>
        )}
      </Show>
    </main>
  );
}
