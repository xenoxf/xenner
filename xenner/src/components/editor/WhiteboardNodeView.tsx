import type { NodeViewProps } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";
import { createUniqueId, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";

import {
  drawingFromDataUrl,
  drawingIdFromSvg,
  drawingViewBox,
  hasDrawingContent,
  parseDrawingPaper,
  parseDrawingSvg,
} from "../../editor/drawing.ts";
import { shouldShowDrawingPreview } from "../../editor/extensions/whiteboard.ts";
import {
  getActiveWhiteboard,
  leaveEditor,
  registerWhiteboardSession,
  updateWhiteboardSession,
} from "../../services/editorSession.ts";
import styles from "../../styles/components/WhiteboardNodeView.module.css";
import type { DrawingTool } from "../../types/drawing.ts";

const WhiteboardBlock = lazy(() =>
  import("./WhiteboardBlock.tsx").then((module) => ({ default: module.WhiteboardBlock })),
);

/**
 * Lo que la vista de nodo necesita de la app para guardar un dibujo.
 *
 * Es el mismo contrato que recibe la extensión del motor (`WhiteboardViewOptions`),
 * y llega aquí desde `NoteEditor`: escribir un asset es cosa de la app —el motor
 * no sabe qué ficheros hay—, así que quien guarda es quien pinta.
 */
export interface WhiteboardSaveOptions {
  onSave(
    svg: string,
    currentSrc: string,
    options?: { notify?: boolean; copy?: boolean },
  ): Promise<string | null>;
  onDeleteAsset?(currentSrc: string): Promise<void>;
}

class WhiteboardView implements NodeView {
  readonly dom: HTMLDivElement;
  private readonly view: NodeViewProps["view"];
  private readonly getPos: NodeViewProps["getPos"];
  private readonly onSave: WhiteboardSaveOptions["onSave"];
  private readonly onDeleteAsset?: WhiteboardSaveOptions["onDeleteAsset"];
  private readonly preview: HTMLButtonElement;
  private readonly image: HTMLImageElement;
  private readonly editorHost: HTMLDivElement;
  private readonly sessionId = `whiteboard-${createUniqueId()}`;
  private currentNode: ProseNode;
  private editing = false;
  private starting = false;
  private dirty = false;
  private cancelled = false;
  private changeVersion = 0;
  private latestSvg = "";
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private savePromise: Promise<boolean> | null = null;
  private unregisterSession: (() => void) | null = null;
  private disposeEditor: (() => void) | null = null;

  constructor(props: NodeViewProps, options: WhiteboardSaveOptions) {
    this.view = props.view;
    this.getPos = props.getPos;
    this.onSave = options.onSave;
    this.onDeleteAsset = options.onDeleteAsset;
    this.currentNode = props.node;

    this.dom = document.createElement("div");
    this.dom.className = styles.node;
    this.dom.contentEditable = "false";

    this.preview = document.createElement("button");
    this.preview.type = "button";
    this.preview.className = styles.preview;
    this.preview.disabled = !this.view.editable;
    this.preview.title = "Doble clic para editar · arrastrar para mover";
    this.preview.setAttribute("aria-label", "Doble clic para editar el dibujo");
    this.preview.addEventListener("dblclick", (event) => {
      event.preventDefault();
      queueMicrotask(() => void this.startEditing());
    });
    // Un clic no abre la pizarra (eso es doble clic), pero sí tiene que decir
    // qué dibujo está activo, igual que cualquier otro elemento seleccionable.
    this.preview.addEventListener("click", () => this.setActive(true));
    this.preview.addEventListener("focus", () => this.setActive(true));
    this.preview.addEventListener("blur", () => this.setActive(false));
    this.preview.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      queueMicrotask(() => void this.startEditing());
    });
    this.dom.addEventListener("dragstart", () => this.dom.classList.add(styles.dragging));
    this.dom.addEventListener("dragend", () => this.dom.classList.remove(styles.dragging));

    this.image = document.createElement("img");
    this.image.alt = "Dibujo";
    this.image.draggable = false;
    this.preview.append(this.image);

    this.editorHost = document.createElement("div");
    this.editorHost.className = styles.editorHost;
    this.dom.append(this.preview, this.editorHost);
    this.syncDraggable();
    this.updatePreview();
    if (props.node.attrs.draft) queueMicrotask(() => void this.startEditing());
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.currentNode.type) return false;
    this.currentNode = node;
    this.preview.disabled = !this.view.editable;
    this.syncDraggable();
    if (node.attrs.draft && !this.editing && !this.starting) queueMicrotask(() => void this.startEditing());
    if (!this.editing) this.updatePreview();
    return true;
  }

  /**
   * El nodo solo se arrastra cuando no hay lienzo abierto dentro.
   *
   * Con el editor montado dentro de `dom`, un `draggable` en el ancestro
   * convierte cualquier arrastre que empiece en su interior en un arrastre
   * nativo del nodo entero. Eso rompía la barra de grosor: al arrastrar el
   * cursor se movía la pizarra en vez de cambiar el trazo.
   */
  private syncDraggable(): void {
    const draggable = this.view.editable && !this.editing && !this.starting;
    this.dom.draggable = draggable;
    this.preview.draggable = draggable;
  }

  selectNode(): void {
    this.dom.classList.add("ProseMirror-selectednode");
    this.setActive(true);
  }

  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode");
    this.setActive(false);
  }

  /** Marca el dibujo como activo para que se vea qué se va a editar. */
  private setActive(active: boolean): void {
    this.dom.classList.toggle(styles.active, active);
  }

  stopEvent(event: Event): boolean {
    if (this.editing) return true;
    if (event.type === "keydown" && event.target === this.preview) {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter" || key === " ") return true;
    }
    if (event.type === "dragstart") {
      const dragEvent = event as DragEvent;
      // Copiar un nodo whiteboard compartiría su asset y drawingId. Por ahora
      // el gesto disponible es mover, no duplicar.
      if (dragEvent.ctrlKey || dragEvent.metaKey || dragEvent.altKey) {
        event.preventDefault();
        return true;
      }
    }
    // Antes de editar dejamos que ProseMirror gestione el arrastre del nodo;
    // una vez abierto el lienzo, aislamos todos sus eventos.
    return !(event.target instanceof Node && this.dom.contains(event.target));
  }

  ignoreMutation(): boolean {
    // The complete subtree is owned by Solid/WhiteboardBlock. Returning false
    // for a selection mutation makes ProseMirror reparse the atom and can
    // replace the live editor while a click or text edit is in progress.
    return true;
  }

  destroy(): void {
    if (!this.cancelled && this.dirty) void this.saveLatest(true);
    this.stopEditing();
    this.dom.remove();
  }

  private updatePreview(): void {
    const src = typeof this.currentNode.attrs.src === "string" ? this.currentNode.attrs.src : "";
    const svg = src ? drawingFromDataUrl(src) : "";
    const shapes = svg ? parseDrawingSvg(svg) : [];
    // Si la persona redimensionó el papel, la nota muestra ese papel y no el
    // recorte ajustado al dibujo.
    const view = parseDrawingPaper(svg) ?? drawingViewBox(shapes);
    const hasContent = shapes.length > 0;
    if (src && hasContent) this.image.src = src;
    else this.image.removeAttribute("src");
    this.image.style.width = hasContent ? `${Math.min(1_000, view.width)}px` : "";
    this.image.style.aspectRatio = hasContent ? `${view.width} / ${view.height}` : "";
    // En la nota un dibujo es contenido, no un lienzo enmarcado. Un borrador
    // vacío no deja nunca un tablero en blanco: o hay figuras o se edita.
    this.dom.classList.toggle(styles.empty, !hasContent);
    this.syncVisibility(hasContent);
  }

  /**
   * El editor se incrusta en el MISMO nodo, así que la vista previa tiene que
   * desaparecer mientras esté abierto: si se queda, el lienzo aparece debajo
   * del dibujo en lugar de ocupar su lugar.
   */
  private syncVisibility(hasContent: boolean): void {
    this.preview.hidden = !shouldShowDrawingPreview({
      editing: this.editing,
      starting: this.starting,
      hasContent,
    });
  }

  private async startEditing(): Promise<void> {
    const src = typeof this.currentNode.attrs.src === "string" ? this.currentNode.attrs.src : "";
    if (this.editing || this.starting || !src || !this.view.editable || this.view.isDestroyed) return;
    this.starting = true;
    // Antes de que llegue el lienzo hay que quitar el arrastre: mientras monta,
    // un gesto rápido sobre la barra de grosor todavía movería el nodo.
    this.syncDraggable();
    // `starting` ya cuenta para syncVisibility, pero lo aplicamos ya para que el
    // lienzo nunca llegue a coexistir un frame con la vista previa del dibujo.
    this.preview.hidden = true;
    this.setActive(false);
    this.dom.classList.remove("ProseMirror-selectednode");
    try {
      const active = getActiveWhiteboard();
      if (active && active.id !== this.sessionId && !(await leaveEditor())) return;
      if (this.view.isDestroyed) return;
      this.editing = true;
      this.latestSvg = drawingFromDataUrl(src);
      this.unregisterSession = registerWhiteboardSession({
        id: this.sessionId,
        save: (closeAfter) => this.saveLatest(closeAfter ?? false),
        close: () => this.stopEditing(),
      });
      const tool = this.currentNode.attrs.tool;
      const drawingId =
        (typeof this.currentNode.attrs.drawingId === "string" && this.currentNode.attrs.drawingId) ||
        drawingIdFromSvg(this.latestSvg) ||
        undefined;
      this.disposeEditor = render(
        () => (
          <Suspense fallback={<div class={styles.loading}>Preparando dibujo…</div>}>
            <WhiteboardBlock
              initialSvg={this.latestSvg}
              initialTool={tool as DrawingTool}
              drawingId={drawingId}
              onChange={(svg) => this.changed(svg)}
              onDirtyChange={(dirty) => this.setDirty(dirty)}
              onSavingChange={(saving) => updateWhiteboardSession(this.sessionId, { saving })}
              onSave={() => this.saveLatest(true)}
              onCancel={() => void this.cancel()}
            />
          </Suspense>
        ),
        this.editorHost,
      );
    } catch {
      this.editing = false;
      this.disposeEditor?.();
      this.disposeEditor = null;
      this.editorHost.replaceChildren();
      this.unregisterSession?.();
      this.unregisterSession = null;
    } finally {
      this.starting = false;
      // `starting` contaba para la visibilidad de la vista previa. Al bajar hay
      // que volver a decidir, o un fallo al abrir el lienzo dejaría el dibujo
      // oculto sin nada en su lugar.
      this.syncDraggable();
      this.updatePreview();
    }
  }

  private changed(svg: string): void {
    if (this.cancelled) return;
    this.changeVersion += 1;
    this.latestSvg = svg;
    this.setDirty(true);
  }

  private setDirty(dirty: boolean): void {
    if (this.cancelled && dirty) return;
    this.dirty = dirty;
    updateWhiteboardSession(this.sessionId, { dirty });
    if (dirty) this.scheduleAutosave();
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      if (this.dirty) {
        updateWhiteboardSession(this.sessionId, { saving: true });
        void this.saveLatest(false);
      }
    }, 900);
  }

  private stopEditing(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    this.disposeEditor?.();
    this.disposeEditor = null;
    this.editorHost.replaceChildren();
    this.editing = false;
    this.unregisterSession?.();
    this.unregisterSession = null;
    // Sin lienzo dentro, el nodo vuelve a poder arrastrarse.
    this.syncDraggable();
    // `editing` ya es false, así que updatePreview -> syncVisibility decide si
    // la vista previa vuelve a ocupar el lugar del lienzo.
    this.updatePreview();
    queueMicrotask(() => {
      if (!this.view.isDestroyed) this.preview.focus({ preventScroll: true });
    });
  }

  private async saveLatest(closeAfter: boolean): Promise<boolean> {
    if (this.cancelled) {
      if (closeAfter) this.stopEditing();
      return true;
    }
    if (this.savePromise) {
      const saved = await this.savePromise;
      if (closeAfter && saved && !this.cancelled) {
        if (this.dirty) return this.saveLatest(true);
        this.stopEditing();
      }
      return saved;
    }

    const task = this.saveUntilStable(closeAfter);
    this.savePromise = task.finally(() => {
      this.savePromise = null;
      updateWhiteboardSession(this.sessionId, { saving: false });
    });
    return this.savePromise;
  }

  private async saveUntilStable(closeAfter: boolean): Promise<boolean> {
    while (!this.cancelled) {
      if (!this.dirty) {
        if (closeAfter && this.currentNode.attrs.draft) return this.discardCurrentNode();
        if (closeAfter) this.stopEditing();
        return true;
      }

      const version = this.changeVersion;
      const svg = this.latestSvg;
      if (!hasDrawingContent(svg)) return this.discardCurrentNode();

      const saved = await this.persistSvg(svg, closeAfter);
      if (!saved) return false;
      if (version !== this.changeVersion) continue;

      this.dirty = false;
      this.latestSvg = svg;
      if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      updateWhiteboardSession(this.sessionId, { dirty: false, saving: false });
      if (closeAfter) this.stopEditing();
      return true;
    }

    if (closeAfter) this.stopEditing();
    return true;
  }

  private async persistSvg(svg: string, closeAfter: boolean): Promise<boolean> {
    if (this.cancelled) return false;
    const currentSrc = this.currentNode.attrs.src;
    const currentDrawingId =
      typeof this.currentNode.attrs.drawingId === "string" ? this.currentNode.attrs.drawingId : "";
    const nextDrawingId = drawingIdFromSvg(svg);
    const copy = Boolean(currentDrawingId && nextDrawingId && currentDrawingId !== nextDrawingId)
      || !currentDrawingId;
    const nextSrc = await this.onSave(svg, currentSrc, { notify: closeAfter, copy });
    if (this.cancelled) return false;
    if (this.view.isDestroyed) return Boolean(nextSrc);
    const pos = this.getPos();
    if (pos === undefined) return false;
    const liveNode = this.view.state.doc.nodeAt(pos);
    if (!nextSrc || !liveNode || liveNode.attrs.src !== currentSrc) return false;
    const attrs = {
      ...this.currentNode.attrs,
      src: nextSrc,
      draft: false,
      drawingId: nextDrawingId ?? currentDrawingId,
      tool: closeAfter ? "select" : this.currentNode.attrs.tool,
    };
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
    this.currentNode = this.view.state.doc.nodeAt(pos) ?? this.currentNode;
    return true;
  }

  private async discardCurrentNode(): Promise<boolean> {
    this.cancelled = true;
    this.dirty = false;
    this.changeVersion += 1;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    updateWhiteboardSession(this.sessionId, { dirty: false, saving: false });

    const currentSrc = this.currentNode.attrs.src;
    if (this.onDeleteAsset && currentSrc) {
      try {
        await this.onDeleteAsset(currentSrc);
      } catch {
        this.cancelled = false;
        this.dirty = true;
        this.scheduleAutosave();
        updateWhiteboardSession(this.sessionId, { dirty: true });
        return false;
      }
    }

    const pos = this.getPos();
    if (!this.view.isDestroyed && pos !== undefined) {
      const liveNode = this.view.state.doc.nodeAt(pos);
      if (liveNode && liveNode.attrs.src === currentSrc) {
        this.stopEditing();
        this.view.dispatch(this.view.state.tr.delete(pos, pos + liveNode.nodeSize));
        return true;
      }
    }
    this.stopEditing();
    return true;
  }

  private async cancel(): Promise<void> {
    if (!this.currentNode.attrs.draft) {
      if (this.dirty) await this.saveLatest(true);
      else this.stopEditing();
      return;
    }
    if (this.savePromise) {
      try {
        await this.savePromise;
      } catch {
        // El nodo se descartará igualmente; la persistencia ya no debe reactivarlo.
      }
    }
    if (!this.cancelled) await this.discardCurrentNode();
  }
}

/**
 * La vista de nodo de la pizarra, en la interfaz de Tiptap.
 *
 * La crea el motor a través de `whiteboard.renderNodeView`, y por eso recibe
 * `NodeViewProps` (`getPos`, `view`, `editor`) y devuelve un `NodeView`. Los
 * callbacks de guardado llegan aparte porque son de la app: el motor dibuja el
 * nodo, pero no sabe escribir en `.assets`.
 */
export function WhiteboardNodeView(
  props: NodeViewProps,
  options: WhiteboardSaveOptions,
): NodeView {
  return new WhiteboardView(props, options);
}
