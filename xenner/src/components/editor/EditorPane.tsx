import { createEffect, createSignal, onCleanup, Show } from "solid-js";

import {
  chooseAttachmentForEditor,
  chooseImageForEditor,
  editorSupportsNativeAttachmentPicker,
  editorSupportsNativeImagePicker,
  importAttachmentForEditor,
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
import type { MarkdownEditorHandle } from "../../types/editor";
import type {
  NoteDocument,
  SaveStatus,
  VaultErrorShape,
} from "../../types/workspace";
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
  const [attachmentBusy, setAttachmentBusy] = createSignal(false);
  const [titleDraft, setTitleDraft] = createSignal("");
  const [titleFocused, setTitleFocused] = createSignal(false);
  let editorHandle: MarkdownEditorHandle | null = null;
  let imageInput: HTMLInputElement | undefined;
  let attachmentInput: HTMLInputElement | undefined;
  let lastDocumentPath: string | undefined;
  let lastDocumentTitle: string | undefined;
  let titleCommitTask: Promise<void> = Promise.resolve();

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
    // Mientras se escribe el título manda el borrador: sincronizarlo aquí
    // devolvía el valor guardado y el input se vaciaba a media palabra.
    if (!titleFocused()) setTitleDraft(document.title);
  });

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

  // El borrador del título se guarda solo en `blur` y con Enter. En escritorio el
  // componente nunca se desmonta, así que basta. En móvil no: al abrir otra nota
  // se cambia el `Show` que envuelve a `EditorPane`, se desmonta el input, y
  // quitar del DOM un elemento con el foco **no** dispara `blur`. El título
  // escrito se perdía sin más, y en móvil el título es el nombre del fichero.
  onCleanup(() => {
    if (!titleFocused()) return;
    setTitleFocused(false);
    void commitTitle();
  });

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

  async function chooseAttachment(): Promise<void> {
    const document = props.document;
    if (!document || attachmentBusy() || !editorReady()) return;
    if (!editorSupportsNativeAttachmentPicker()) {
      attachmentInput?.click();
      return;
    }

    setAttachmentBusy(true);
    try {
      const imported = await chooseAttachmentForEditor(document.path);
      if (!imported || !editorHandle) return;
      editorHandle.insertAttachment(imported.relativePath, imported.fileName);
      notifySuccess("Archivo adjuntado", imported.fileName);
    } catch (error) {
      notifyError("No se pudo adjuntar el archivo", error);
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function insertAttachment(file: File): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || attachmentBusy() || !editorReady()) return;
    setAttachmentBusy(true);
    try {
      const imported = await importAttachmentForEditor(document.path, file);
      editorHandle.insertAttachment(imported.relativePath, imported.fileName);
      notifySuccess("Archivo adjuntado", imported.fileName);
    } catch (error) {
      notifyError("No se pudo adjuntar el archivo", error);
    } finally {
      setAttachmentBusy(false);
      // Vaciar el input es lo que permite volver a elegir el mismo archivo dos
      // veces seguidas: sin esto el `change` no vuelve a dispararse.
      if (attachmentInput) attachmentInput.value = "";
    }
  }

  /**
 * Arrastrar o pegar un archivo cualquiera lo adjunta; si es una imagen, se
   * inserta como imagen, que es lo que se espera al soltar una foto en una nota.
   *
   * Se prefiere la imagen cuando viene acompañado de otra cosa: soltar un
   * `.png` y un `.zip` a la vez debe poner la foto en la nota, no un ZIP.
   */
  function droppedFile(data: DataTransfer | null): File | null {
    const files = [...(data?.files ?? [])];
    return files.find(isImageFile) ?? files[0] ?? null;
  }

  function isImageFile(file: File): boolean {
    return file.type.startsWith("image/");
  }

  function sendFile(file: File): void {
    if (isImageFile(file)) void insertImage(file);
    else void insertAttachment(file);
  }

  function handleFileDrop(event: DragEvent): void {
    const file = droppedFile(event.dataTransfer);
    if (!file) return;
    // Antes del `preventDefault` hay que comprobar el modo: con la pizarra
    // abierta el lienzo captura el gesto y este contenedor no debe llevarse el
    // archivo por delante.
    if (getEditorMode() === "whiteboard") return;
    event.preventDefault();
    sendFile(file);
  }

  function handlePaste(event: ClipboardEvent): void {
    if (getEditorMode() === "whiteboard") return;
    const file = droppedFile(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    sendFile(file);
  }

  /**
   * La carpeta de la nota, con « / » detrás y un hueco al final que hace de
   * separador con el nombre del archivo. Se escribe así a propósito: si la nota
   * está en la raíz no hay carpeta, y de ese hueco se ocupa el nombre.
   */
  function carpetaDe(path: string): string {
    const partes = path.split("/");
    partes.pop();
    return partes.length > 0 ? `${partes.join(" / ")} / ` : "";
  }

  return (
    <main class={styles.pane} data-x="note" aria-label="Editor de nota">
      <Show
        when={props.document}
        fallback={
          <div class={styles.blankState} data-x="note-empty" aria-busy={props.initializing}>
            <Show when={!props.initializing}>
              <div class={styles.emptyState}>
                <span class={styles.emptyIcon} data-x="note-empty-icon"><NoteIcon /></span>
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
                data-x="note-workspace"
                onDragOver={(event) => {
                  // Cualquier archivo, no solo las imágenes. Antes el
                  // `preventDefault` era solo para imágenes mientras el `drop`
                  // aceptaba todas: arrastrar un PDF no cancelaba el gesto, así
                  // que el WebView lo abría por su cuenta en vez de adjuntarlo.
                  if (droppedFile(event.dataTransfer)) event.preventDefault();
                }}
                onDrop={handleFileDrop}
                onPaste={handlePaste}
              >
                <div
                  class={`${styles.scroll} ${props.loading ? styles.loading : ""}`}
                  data-x="note-scroll"
                  aria-busy={props.loading}
                >
                  <div class={styles.documentColumn} data-x="note-document">
                    <div class={styles.heading} data-x="note-heading">
                      <div class={styles.headingMeta}>
                        <span class={styles.path} data-x="note-path"><span class={styles.dir}>{carpetaDe(documentPath)}</span> {documentPath.split("/").pop()}</span>
                        <span class={styles.saveStatus} data-x="note-status" role="status" aria-live="polite">
                          {visibleStatus(props.status)}
                        </span>
                      </div>
                      <input
                        class={styles.titleInput}
                        data-x="note-title"
                        value={titleDraft()}
                        placeholder="Título"
                        aria-label="Nombre y título de la nota"
                        maxlength={NOTE_TITLE_MAX_LENGTH}
                        spellcheck={false}
                        onInput={(event) => {
                          setTitleDraft(event.currentTarget.value);
                        }}
                        onFocus={() => setTitleFocused(true)}
                        onBlur={() => {
                          setTitleFocused(false);
                          void commitTitle();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            setTitleDraft(props.document?.title ?? "");
                            event.currentTarget.blur();
                            return;
                          }
                          if (event.key !== "Enter") return;
                          event.preventDefault();
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
                      // El menú del `+` devuelve el gesto para imagen y adjunto:
                      // los importadores y los diálogos del sistema ya están
                      // aquí montados, y el editor no sabe qué archivos hay.
                      requestImage={() => void chooseImage()}
                      requestAttachment={() => void chooseAttachment()}
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

                {/* Sin `accept`: adjuntar es poder guardar el archivo que sea, y
                    un filtro solo esconde los que nadie adivina. */}
                <input
                  ref={(element) => (attachmentInput = element)}
                  class="sr-only"
                  type="file"
                  aria-label="Seleccionar archivo para adjuntar"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void insertAttachment(file);
                  }}
                />

                <Show when={getEditorMode() !== "whiteboard"}>
                  <EditorToolbar
                    loading={props.loading}
                    ready={editorReady()}
                    imageBusy={imageBusy()}
                    whiteboardBusy={whiteboardBusy()}
                    attachmentBusy={attachmentBusy()}
                    status={statusLabel(props.status)}
                    onChooseImage={() => void chooseImage()}
                    onChooseAttachment={() => void chooseAttachment()}
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
