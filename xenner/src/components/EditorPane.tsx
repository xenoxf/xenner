import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js";

import {
  MarkdownEditor,
  type EditorBlockType,
  type MarkdownEditorHandle,
} from "./MarkdownEditor";
import { importImageForEditor } from "../editor/assets";
import {
  ArrowIcon,
  BulletListIcon,
  CircleIcon,
  HeadingIcon,
  ImageIcon,
  LineIcon,
  MarkdownIcon,
  NoteIcon,
  OrderedListIcon,
  PencilIcon,
  PlusIcon,
  QuoteIcon,
  RefreshIcon,
  SquareIcon,
  TextIcon,
} from "./Icons";
import { notifyError, notifySuccess } from "./ToastRegion";
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
const blockTypes: { id: EditorBlockType; label: string }[] = [
  { id: "paragraph", label: "Texto" },
  { id: "heading1", label: "Título 1" },
  { id: "heading2", label: "Título 2" },
  { id: "bullet", label: "Lista" },
  { id: "ordered", label: "Numerada" },
  { id: "quote", label: "Cita" },
];

function BlockIcon(props: { type: EditorBlockType }): JSX.Element {
  switch (props.type) {
    case "paragraph":
      return <TextIcon />;
    case "heading1":
    case "heading2":
      return <HeadingIcon />;
    case "bullet":
      return <BulletListIcon />;
    case "ordered":
      return <OrderedListIcon />;
    case "quote":
      return <QuoteIcon />;
  }
}

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
  const [blockMenuOpen, setBlockMenuOpen] = createSignal(false);
  const [shapeMenuOpen, setShapeMenuOpen] = createSignal(false);
  const [shapeColor, setShapeColor] = createSignal<ShapeColor>("#5b9bd5");
  const [shapeBusy, setShapeBusy] = createSignal(false);
  const [imageBusy, setImageBusy] = createSignal(false);
  const [editorReady, setEditorReady] = createSignal(false);
  const [sourceMode, setSourceMode] = createSignal(false);
  let editorHandle: MarkdownEditorHandle | null = null;
  let imageInput: HTMLInputElement | undefined;
  let blockMenu: HTMLDivElement | undefined;
  let blockTrigger: HTMLButtonElement | undefined;
  let shapeMenu: HTMLDivElement | undefined;
  let shapeTrigger: HTMLButtonElement | undefined;
  let activeDocumentPath: string | null = null;

  createEffect(() => {
    const documentPath = props.document?.path ?? null;
    if (documentPath === activeDocumentPath) return;
    activeDocumentPath = documentPath;
    setBlockMenuOpen(false);
    setShapeMenuOpen(false);
  });

  onMount(() => {
    const closeMenuOutside = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!blockMenu?.contains(target) && !blockTrigger?.contains(target)) {
        setBlockMenuOpen(false);
      }
      if (!shapeMenu?.contains(target) && !shapeTrigger?.contains(target)) {
        setShapeMenuOpen(false);
      }
    };
    const closeMenuWithEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        const returnFocus = blockMenuOpen() ? blockTrigger : shapeMenuOpen() ? shapeTrigger : null;
        setBlockMenuOpen(false);
        setShapeMenuOpen(false);
        if (returnFocus) queueMicrotask(() => returnFocus.focus());
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
    setBlockMenuOpen(false);
    setShapeMenuOpen(false);
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

  function toggleBlockMenu(): void {
    if (props.loading || sourceMode() || !editorReady()) return;
    setShapeMenuOpen(false);
    setBlockMenuOpen((open) => !open);
  }

  function applyBlockType(type: EditorBlockType): void {
    if (!editorHandle || !editorReady() || props.loading || sourceMode()) return;
    editorHandle.setBlockType(type);
    setBlockMenuOpen(false);
    editorHandle.focus();
  }

  function addTextBlock(): void {
    if (!editorHandle || !editorReady() || props.loading || sourceMode()) return;
    closePopovers();
    editorHandle.insertTextBlock();
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

  function toggleShapeMenu(): void {
    if (props.loading || sourceMode() || shapeBusy() || !editorReady()) return;
    setBlockMenuOpen(false);
    setShapeMenuOpen((open) => !open);
  }

  async function insertShape(tool: ShapeTool): Promise<void> {
    const document = props.document;
    if (!document || !editorHandle || shapeBusy() || !editorReady()) return;
    setShapeBusy(true);
    try {
      const svg = createShapeSvg(tool, shapeColor());
      const file = new File([svg], "figura.svg", { type: "image/svg+xml" });
      const imported = await importImageForEditor(document.path, file);
      editorHandle.insertAsset(imported.dataUrl, imported.relativePath, "Figura");
      setShapeMenuOpen(false);
      const label = shapeTools.find((item) => item.id === tool)?.label ?? "Figura";
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
                        ref={(element) => (blockTrigger = element)}
                        type="button"
                        class="asset-dock-button"
                        classList={{ open: blockMenuOpen() }}
                        disabled={props.loading || sourceMode() || !editorReady()}
                        aria-label="Tipo de bloque"
                        aria-haspopup="menu"
                        aria-controls="editor-block-menu"
                        aria-expanded={blockMenuOpen()}
                        title={editorReady() ? "Tipo de bloque" : "Preparando editor"}
                        onClick={toggleBlockMenu}
                      >
                        <TextIcon />
                      </button>
                      <Show when={blockMenuOpen()}>
                        <div
                          ref={(element) => (blockMenu = element)}
                          id="editor-block-menu"
                          class="asset-menu block-picker"
                          role="menu"
                          aria-label="Tipo de bloque"
                        >
                          <p>Bloque</p>
                          <div class="block-picker-grid" role="group" aria-label="Formatos de texto">
                            <For each={blockTypes}>
                              {(block) => (
                                <button
                                  type="button"
                                  class="block-picker-item"
                                  role="menuitem"
                                  onClick={() => applyBlockType(block.id)}
                                >
                                  <span><BlockIcon type={block.id} /></span>
                                  {block.label}
                                </button>
                              )}
                            </For>
                          </div>
                        </div>
                      </Show>
                    </div>
                    <span class="asset-dock-separator" aria-hidden="true" />
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
                    <div class="asset-menu-anchor">
                      <button
                        ref={(element) => (shapeTrigger = element)}
                        type="button"
                        class="asset-dock-button"
                        classList={{ open: shapeMenuOpen(), busy: shapeBusy() }}
                        disabled={props.loading || shapeBusy() || sourceMode() || !editorReady()}
                        aria-label="Dibujar"
                        aria-haspopup="menu"
                        aria-controls="editor-shape-menu"
                        aria-expanded={shapeMenuOpen()}
                        title={editorReady() ? "Dibujar" : "Preparando editor"}
                        onClick={toggleShapeMenu}
                      >
                        <PencilIcon />
                      </button>
                      <Show when={shapeMenuOpen()}>
                        <div
                          ref={(element) => (shapeMenu = element)}
                          id="editor-shape-menu"
                          class="asset-menu shape-picker"
                          role="menu"
                          aria-label="Dibujar e insertar figuras"
                        >
                          <p>Figuras</p>
                          <div class="shape-tool-grid" role="group" aria-label="Tipos de figura">
                            <For each={shapeTools}>
                              {(tool) => (
                                <button
                                  type="button"
                                  class="shape-tool-action"
                                  role="menuitem"
                                  disabled={shapeBusy()}
                                  aria-label={`Insertar ${tool.label.toLowerCase()}`}
                                  title={tool.label}
                                  onClick={() => void insertShape(tool.id)}
                                >
                                  <ShapeToolIcon tool={tool.id} />
                                </button>
                              )}
                            </For>
                          </div>
                          <div class="shape-picker-colors">
                            <span>Color</span>
                            <div role="group" aria-label="Color de la figura">
                              <For each={shapeColors}>
                                {(color) => (
                                  <button
                                    type="button"
                                    class="shape-color-button"
                                    classList={{ active: shapeColor() === color }}
                                    style={`--shape-color: ${color}`}
                                    role="menuitemradio"
                                    aria-label={`Color ${color}`}
                                    aria-checked={shapeColor() === color}
                                    title={`Color ${color}`}
                                    onClick={() => setShapeColor(color)}
                                  />
                                )}
                              </For>
                            </div>
                          </div>
                        </div>
                      </Show>
                    </div>
                    <span class="asset-dock-separator" aria-hidden="true" />
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
                    <button
                      type="button"
                      class="asset-dock-button"
                      disabled={props.loading || sourceMode() || !editorReady()}
                      aria-label="Añadir bloque de texto"
                      title="Añadir bloque de texto"
                      onClick={addTextBlock}
                    >
                      <PlusIcon />
                    </button>
                    <span class="sr-only" role="status" aria-live="polite">
                      {statusLabel(props.status)}
                    </span>
                  </div>
              </div>
            )}
          </Show>
        )}
      </Show>
    </main>
  );
}
