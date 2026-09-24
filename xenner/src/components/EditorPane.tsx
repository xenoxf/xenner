import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js";

import { DrawingModal, parseDrawingSvg } from "./DrawingModal";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import { importImageForEditor } from "../editor/assets";
import {
  ArrowIcon,
  CheckIcon,
  CircleIcon,
  ImageIcon,
  LineIcon,
  MarkdownIcon,
  NoteIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  ShapesIcon,
  SquareIcon,
  TextColorIcon,
  TextIcon,
} from "./Icons";
import { notify, notifyError, notifySuccess } from "./ToastRegion";
import { NOTE_TITLE_MAX_LENGTH } from "../workspace/note";
import { getWorkspaceGateway } from "../workspace/gateway";
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

type ShapeTool = "pen" | "rect" | "ellipse" | "line" | "arrow" | "text";
type ShapeColor = "#5b9bd5" | "#e7e7e4" | "#e05d5d" | "#5ac47a" | "#f0b35c";

const shapeTools: { id: ShapeTool; label: string }[] = [
  { id: "pen", label: "Trazo" },
  { id: "rect", label: "Rectángulo" },
  { id: "ellipse", label: "Elipse" },
  { id: "line", label: "Línea" },
  { id: "arrow", label: "Flecha" },
  { id: "text", label: "Texto" },
];
const shapeColors: ShapeColor[] = ["#5b9bd5", "#e7e7e4", "#e05d5d", "#5ac47a", "#f0b35c"];
const textColorPresets = ["#2563eb", "#dc2626", "#059669", "#7c3aed", "#ea580c", "#111827"];

function ShapeToolIcon(props: { tool: ShapeTool }): JSX.Element {
  switch (props.tool) {
    case "pen":
      return <PencilIcon />;
    case "rect":
      return <SquareIcon />;
    case "ellipse":
      return <CircleIcon />;
    case "line":
      return <LineIcon />;
    case "arrow":
      return <ArrowIcon />;
    case "text":
      return <TextIcon />;
  }
}

function createShapeSvg(tool: ShapeTool, color: ShapeColor): string {
  const common = `fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
  const body = (() => {
    switch (tool) {
      case "pen":
        return `<path d="M180 360 C300 120 470 440 700 180" ${common} />`;
      case "rect":
        return `<rect x="190" y="120" width="500" height="300" rx="28" ${common} />`;
      case "ellipse":
        return `<ellipse cx="440" cy="270" rx="250" ry="150" ${common} />`;
      case "line":
        return `<line x1="190" y1="370" x2="690" y2="170" ${common} />`;
      case "arrow":
        return `<line x1="190" y1="370" x2="690" y2="170" ${common} marker-end="url(#shape-arrow)" />`;
      case "text":
        return `<text x="440" y="300" fill="${color}" font-family="sans-serif" font-size="72" text-anchor="middle">Texto</text>`;
    }
  })();
  const marker = tool === "arrow" ? `<marker id="shape-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="${color}" /></marker>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 540" data-xenner-asset="safe"><defs>${marker}</defs>${body}</svg>`;
}

function displayName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function EditorPane(props: EditorPaneProps) {
  const [shapePopoverOpen, setShapePopoverOpen] = createSignal(false);
  const [drawingOpen, setDrawingOpen] = createSignal(false);
  const [shapeTool, setShapeTool] = createSignal<ShapeTool>("rect");
  const [shapeColor, setShapeColor] = createSignal<ShapeColor>("#5b9bd5");
  const [shapeBusy, setShapeBusy] = createSignal(false);
  const [imageBusy, setImageBusy] = createSignal(false);
  const [editorReady, setEditorReady] = createSignal(false);
  const [sourceMode, setSourceMode] = createSignal(false);
  const [insertMenuOpen, setInsertMenuOpen] = createSignal(false);
  const [textColorMenuOpen, setTextColorMenuOpen] = createSignal(false);
  const [textColor, setTextColor] = createSignal(textColorPresets[0]);
  let editorHandle: MarkdownEditorHandle | null = null;
  let imageInput: HTMLInputElement | undefined;
  let insertMenu: HTMLDivElement | undefined;
  let insertTrigger: HTMLButtonElement | undefined;
  let shapePopover: HTMLDivElement | undefined;
  let textColorMenu: HTMLDivElement | undefined;
  let textColorTrigger: HTMLButtonElement | undefined;
  let activeDocumentPath: string | null = null;

  createEffect(() => {
    const documentPath = props.document?.path ?? null;
    if (documentPath === activeDocumentPath) return;
    activeDocumentPath = documentPath;
    setDrawingOpen(false);
    setInsertMenuOpen(false);
    setTextColorMenuOpen(false);
    setShapePopoverOpen(false);
  });

  onMount(() => {
    const closeMenuOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!insertMenu?.contains(target) && !insertTrigger?.contains(target)) {
        setInsertMenuOpen(false);
      }
      if (!textColorMenu?.contains(target) && !textColorTrigger?.contains(target)) {
        setTextColorMenuOpen(false);
      }
      if (!shapePopover?.contains(target)) setShapePopoverOpen(false);
    };
    const closeMenuWithEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setInsertMenuOpen(false);
        setTextColorMenuOpen(false);
        setShapePopoverOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeMenuOutside);
    document.addEventListener("keydown", closeMenuWithEscape);
    onCleanup(() => {
      document.removeEventListener("pointerdown", closeMenuOutside);
      document.removeEventListener("keydown", closeMenuWithEscape);
    });
  });

  function closePopovers(): void {
    setInsertMenuOpen(false);
    setTextColorMenuOpen(false);
    setShapePopoverOpen(false);
  }

  function moveToolbarFocus(event: KeyboardEvent, container: HTMLElement | undefined): void {
    if (!container || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const controls = [...container.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = controls.length - 1;
    else if (event.key === "ArrowRight") next = (Math.max(current, 0) + 1) % controls.length;
    else next = (Math.max(current, 0) - 1 + controls.length) % controls.length;
    event.preventDefault();
    controls[next]?.focus();
  }

  function applyTextColor(color: string | null): void {
    if (!editorHandle || !editorReady() || props.loading || sourceMode()) return;
    if (!editorHandle.applyTextColor(color)) {
      notify({ title: "Selecciona texto", message: "El color se aplica al texto resaltado.", tone: "info" });
      editorHandle.focus();
      return;
    }
    if (color) setTextColor(color);
    setTextColorMenuOpen(false);
  }

  async function chooseImage(): Promise<void> {
    closePopovers();
    const document = props.document;
    if (!document || imageBusy() || !editorReady()) return;
    if (!getWorkspaceGateway().canChooseImageAsset) {
      imageInput?.click();
      return;
    }

    setImageBusy(true);
    try {
      const imported = await getWorkspaceGateway().chooseImageAsset(document.path);
      if (!imported || !editorHandle) return;
      const dataUrl = `data:${imported.mime};base64,${imported.dataBase64}`;
      editorHandle.insertAsset(dataUrl, imported.relativePath, imported.fileName);
      notifySuccess("Imagen insertada", imported.fileName);
    } catch (error) {
      notifyError("No se pudo insertar la imagen", error);
    } finally {
      setImageBusy(false);
    }
  }

  function openShapeToolbar(tool: ShapeTool): void {
    if (props.loading || sourceMode() || shapeBusy() || !editorReady()) return;
    closePopovers();
    setShapeTool(tool);
    setShapePopoverOpen(true);
  }

  function openDrawing(): void {
    if (props.loading || sourceMode() || shapeBusy() || !editorReady()) return;
    closePopovers();
    setDrawingOpen(true);
  }

  async function saveDrawing(svg: string): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || shapeBusy() || !editorReady()) return;
    if (parseDrawingSvg(svg).length === 0) {
      notify({ title: "El lienzo está vacío", message: "Dibuja al menos una figura antes de insertar.", tone: "info" });
      return;
    }
    setShapeBusy(true);
    try {
      const file = new File([svg], "dibujo.svg", { type: "image/svg+xml" });
      const imported = await importImageForEditor(document.path, file);
      editorHandle.insertAsset(imported.dataUrl, imported.relativePath, "Dibujo");
      setDrawingOpen(false);
      notifySuccess("Dibujo insertado", "Se añadió al final del bloque actual");
    } catch (error) {
      notifyError("No se pudo insertar el dibujo", error);
    } finally {
      setShapeBusy(false);
    }
  }

  async function insertShape(): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || shapeBusy() || !editorReady()) return;
    setShapeBusy(true);
    try {
      const svg = createShapeSvg(shapeTool(), shapeColor());
      const file = new File([svg], "figura.svg", { type: "image/svg+xml" });
      const imported = await importImageForEditor(document.path, file);
      editorHandle.insertAsset(imported.dataUrl, imported.relativePath, "Figura");
      setShapePopoverOpen(false);
      notifySuccess("Figura insertada", "Se añadió al final del bloque actual");
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
          <Show when={props.document?.path} keyed>
            {(documentPath) => (
              <div class="editor-workspace">
                  <div
                    class="editor-scroll rich-editor-scroll"
                    classList={{ loading: props.loading }}
                    aria-busy={props.loading}
                  >
                    <div class="document-column">
                      <div class="document-heading">
                        <input
                          class="note-title-input"
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
                        <div class="editor-alert" role="group" aria-label="Error de guardado">
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

                  <div
                    class="editor-asset-dock"
                    role="toolbar"
                    aria-label="Acciones del editor"
                    onKeyDown={(event) => moveToolbarFocus(event, event.currentTarget)}
                  >
                    <div class="asset-menu-anchor">
                      <button
                        ref={(element) => (insertTrigger = element)}
                        type="button"
                        class="asset-dock-button asset-add-button"
                        classList={{ open: insertMenuOpen(), busy: imageBusy() }}
                        disabled={props.loading || imageBusy() || sourceMode() || !editorReady()}
                        aria-label="Insertar contenido"
                        aria-haspopup="menu"
                        aria-controls="editor-insert-menu"
                        aria-expanded={insertMenuOpen()}
                        title={!editorReady() ? "Preparando editor" : imageBusy() ? "Procesando imagen" : "Insertar contenido"}
                        onClick={() => {
                          setTextColorMenuOpen(false);
                          setShapePopoverOpen(false);
                          setInsertMenuOpen((open) => !open);
                        }}
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
                            disabled={props.loading || imageBusy() || sourceMode() || !editorReady()}
                            onClick={() => void chooseImage()}
                          >
                            <span><ImageIcon /></span>
                            Imagen
                          </button>
                          <button
                            type="button"
                            class="asset-menu-item"
                            role="menuitem"
                            disabled={props.loading || shapeBusy() || sourceMode() || !editorReady()}
                            onClick={() => openShapeToolbar("rect")}
                          >
                            <span><ShapesIcon /></span>
                            Figura
                          </button>
                        </div>
                      </Show>
                    </div>
                    <div class="asset-menu-anchor">
                      <button
                        ref={(element) => (textColorTrigger = element)}
                        type="button"
                        class="asset-dock-button text-color-trigger"
                        classList={{ open: textColorMenuOpen() }}
                        style={`--selected-text-color: ${textColor()}`}
                        disabled={props.loading || sourceMode() || !editorReady()}
                        aria-label="Color del texto"
                        aria-haspopup="menu"
                        aria-controls="editor-text-color-menu"
                        aria-expanded={textColorMenuOpen()}
                        title={editorReady() ? "Color del texto" : "Preparando editor"}
                        onClick={() => {
                          setInsertMenuOpen(false);
                          setShapePopoverOpen(false);
                          setTextColorMenuOpen((open) => !open);
                        }}
                      >
                        <TextColorIcon />
                      </button>
                      <Show when={textColorMenuOpen()}>
                        <div
                          ref={(element) => (textColorMenu = element)}
                          id="editor-text-color-menu"
                          class="asset-menu text-color-menu"
                          role="menu"
                          aria-label="Color del texto"
                        >
                          <p>Color del texto</p>
                          <div class="text-color-grid" role="group" aria-label="Colores predefinidos">
                            <For each={textColorPresets}>
                              {(color) => (
                                <button
                                  type="button"
                                  class="text-color-swatch"
                                  classList={{ active: textColor() === color }}
                                  style={`--text-swatch: ${color}`}
                                  role="menuitemradio"
                                  aria-label={`Color ${color}`}
                                  aria-checked={textColor() === color}
                                  title={`Color ${color}`}
                                  onClick={() => applyTextColor(color)}
                                />
                              )}
                            </For>
                          </div>
                          <label class="custom-text-color">
                            <span>Personalizado</span>
                            <input
                              type="color"
                              value={textColor()}
                              aria-label="Elegir color personalizado"
                              onInput={(event) => setTextColor(event.currentTarget.value)}
                              onChange={() => applyTextColor(textColor())}
                            />
                          </label>
                          <button
                            type="button"
                            class="asset-menu-item text-color-auto"
                            role="menuitem"
                            onClick={() => applyTextColor(null)}
                          >
                            <span><RefreshIcon /></span>
                            Automático
                          </button>
                        </div>
                      </Show>
                    </div>
                    <button
                      type="button"
                      class="asset-dock-button"
                      classList={{ busy: imageBusy() }}
                      disabled={props.loading || imageBusy() || sourceMode() || !editorReady()}
                      aria-label="Insertar imagen"
                      title={editorReady() ? "Insertar imagen" : "Preparando editor"}
                      onClick={() => void chooseImage()}
                    >
                      <ImageIcon />
                    </button>
                    <button
                      type="button"
                      class="asset-dock-button"
                      classList={{ busy: shapeBusy() }}
                      disabled={props.loading || shapeBusy() || sourceMode() || !editorReady()}
                      aria-label="Dibujar"
                      title={editorReady() ? "Dibujar" : "Preparando editor"}
                      onClick={openDrawing}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      class="asset-dock-button"
                      classList={{ busy: shapeBusy() }}
                      disabled={props.loading || shapeBusy() || sourceMode() || !editorReady()}
                      aria-label="Añadir figura"
                      title={editorReady() ? "Añadir figura" : "Preparando editor"}
                      onClick={() => openShapeToolbar("rect")}
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
                        closePopovers();
                        setSourceMode((value) => !value);
                      }}
                    >
                      <MarkdownIcon />
                    </button>
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
                  <Show when={shapePopoverOpen()}>
                    <div
                      ref={(element) => (shapePopover = element)}
                      class="floating-drawing-toolbar"
                      role="toolbar"
                      aria-label="Herramientas de figura"
                      onKeyDown={(event) => moveToolbarFocus(event, event.currentTarget)}
                    >
                      <div class="floating-tool-group" role="group" aria-label="Herramientas">
                        <For each={shapeTools}>
                          {(tool) => (
                            <button
                              type="button"
                              class="floating-tool-button"
                              classList={{ active: shapeTool() === tool.id }}
                              aria-label={tool.label}
                              aria-pressed={shapeTool() === tool.id}
                              title={tool.label}
                              onClick={() => setShapeTool(tool.id)}
                            >
                              <ShapeToolIcon tool={tool.id} />
                            </button>
                          )}
                        </For>
                      </div>
                      <span class="floating-tool-divider" aria-hidden="true" />
                      <div class="floating-tool-group shape-colors" role="group" aria-label="Color">
                        <For each={shapeColors}>
                          {(color) => (
                            <button
                              type="button"
                              class="shape-color-button"
                              classList={{ active: shapeColor() === color }}
                              style={`--shape-color: ${color}`}
                              aria-label={`Color ${color}`}
                              aria-pressed={shapeColor() === color}
                              title={`Color ${color}`}
                              onClick={() => setShapeColor(color)}
                            />
                          )}
                        </For>
                      </div>
                      <span class="floating-tool-divider" aria-hidden="true" />
                      <button
                        type="button"
                        class="floating-tool-button floating-insert-button"
                        classList={{ busy: shapeBusy() }}
                        disabled={shapeBusy()}
                        aria-label="Insertar figura"
                        title="Insertar figura"
                        onClick={() => void insertShape()}
                      >
                        <CheckIcon />
                      </button>
                    </div>
                  </Show>
              </div>
            )}
          </Show>
        )}
      </Show>
      <Show when={drawingOpen()}>
        <DrawingModal
          initialTool="pen"
          title="Nuevo dibujo"
          submitLabel="Insertar dibujo"
          busy={shapeBusy()}
          onSave={(svg) => saveDrawing(svg)}
          onClose={() => setDrawingOpen(false)}
        />
      </Show>
    </main>
  );
}
