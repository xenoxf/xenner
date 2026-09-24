import { createSignal, Show } from "solid-js";

import { createShapeSvg } from "../../editor/shapeSvg";
import {
  chooseImageForEditor,
  editorSupportsNativeImagePicker,
  importImageForEditor,
} from "../../services/editorAssets";
import { notifyError, notifySuccess } from "../../services/toastService";
import { SHAPE_TOOLS } from "../../data/editor";
import styles from "../../styles/components/EditorPane.module.css";
import type {
  EditorBlockType,
  MarkdownEditorHandle,
  ShapeColor,
  ShapeTool,
} from "../../types/editor";
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
  onTitleChange(title: string): void;
  onCreate(): void;
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

export function EditorPane(props: EditorPaneProps) {
  const [shapeBusy, setShapeBusy] = createSignal(false);
  const [imageBusy, setImageBusy] = createSignal(false);
  const [editorReady, setEditorReady] = createSignal(false);
  const [sourceMode, setSourceMode] = createSignal(false);
  let editorHandle: MarkdownEditorHandle | null = null;
  let imageInput: HTMLInputElement | undefined;

  function applyBlockType(type: EditorBlockType): void {
    if (!editorHandle || !editorReady() || props.loading || sourceMode()) return;
    editorHandle.setBlockType(type);
    editorHandle.focus();
  }

  function addTextBlock(): void {
    if (!editorHandle || !editorReady() || props.loading || sourceMode()) return;
    editorHandle.insertTextBlock();
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
      editorHandle.insertAsset(imported.dataUrl, imported.relativePath, imported.fileName);
      notifySuccess("Imagen insertada", imported.fileName);
    } catch (error) {
      notifyError("No se pudo insertar la imagen", error);
    } finally {
      setImageBusy(false);
    }
  }

  async function insertShape(tool: ShapeTool, color: ShapeColor): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || shapeBusy() || !editorReady()) return;
    setShapeBusy(true);
    try {
      const svg = createShapeSvg(tool, color);
      const file = new File([svg], "figura.svg", { type: "image/svg+xml" });
      const imported = await importImageForEditor(document.path, file);
      editorHandle.insertAsset(imported.dataUrl, imported.relativePath, "Figura");
      const label = SHAPE_TOOLS.find((item) => item.id === tool)?.label ?? "Figura";
      notifySuccess("Figura insertada", label);
    } catch (error) {
      notifyError("No se pudo insertar la figura", error);
    } finally {
      setShapeBusy(false);
    }
  }

  async function insertImage(file: File): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || imageBusy() || !editorReady()) return;
    setImageBusy(true);
    try {
      const imported = await importImageForEditor(document.path, file);
      editorHandle.insertAsset(imported.dataUrl, imported.relativePath, file.name);
      notifySuccess("Imagen insertada", file.name);
    } catch (error) {
      notifyError("No se pudo insertar la imagen", error);
    } finally {
      setImageBusy(false);
      if (imageInput) imageInput.value = "";
    }
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
                <h1>Una nota, un archivo Markdown</h1>
                <p>Crea una nota desde el explorador para empezar a escribir.</p>
                <Button variant="primary" onClick={props.onCreate}>Nueva nota</Button>
              </div>
            </Show>
          </div>
        }
      >
        {(document) => (
          <Show when={props.document?.path} keyed>
            {(documentPath) => (
              <div class={styles.workspace}>
                <div
                  class={`${styles.scroll} ${props.loading ? styles.loading : ""}`}
                  aria-busy={props.loading}
                >
                  <div class={styles.documentColumn}>
                    <div class={styles.heading}>
                      <input
                        class={styles.titleInput}
                        value={document().title}
                        placeholder="Título"
                        aria-label="Título de la nota"
                        maxlength={NOTE_TITLE_MAX_LENGTH}
                        spellcheck={false}
                        onInput={(event) => props.onTitleChange(event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          editorHandle?.focus();
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
                    <Show
                      when={!sourceMode()}
                      fallback={
                        <textarea
                          class={styles.sourceEditor}
                          aria-label={`Contenido Markdown de ${baseName(documentPath)}`}
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
                          setEditorReady(true);
                        }}
                        onDispose={() => {
                          editorHandle = null;
                          setEditorReady(false);
                        }}
                      />
                    </Show>
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

                <EditorToolbar
                  loading={props.loading}
                  sourceMode={sourceMode()}
                  ready={editorReady()}
                  imageBusy={imageBusy()}
                  shapeBusy={shapeBusy()}
                  status={statusLabel(props.status)}
                  onApplyBlock={applyBlockType}
                  onChooseImage={() => void chooseImage()}
                  onInsertShape={(tool, color) => void insertShape(tool, color)}
                  onAddText={addTextBlock}
                  onToggleSource={() => setSourceMode((value) => !value)}
                />
              </div>
            )}
          </Show>
        )}
      </Show>
    </main>
  );
}
