import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type {
  EditorView,
  NodeView,
} from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";
import { createUniqueId, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";

import {
  drawingFromDataUrl,
  drawingIdFromSvg,
  drawingViewBox,
  hasDrawingContent,
  parseDrawingSvg,
} from "../../editor/drawing";
import { whiteboardNode } from "../../editor/whiteboard-node";
import {
  getActiveWhiteboard,
  leaveEditor,
  registerWhiteboardSession,
  updateWhiteboardSession,
} from "../../services/editorSession";
import styles from "../../styles/components/WhiteboardNodeView.module.css";
import type { DrawingTool } from "../../types/drawing";

const WhiteboardBlock = lazy(() =>
  import("./WhiteboardBlock").then((module) => ({ default: module.WhiteboardBlock })),
);

export interface WhiteboardViewOptions {
  onSave(
    svg: string,
    currentSrc: string,
    options?: { notify?: boolean; copy?: boolean },
  ): Promise<string | null>;
  onDeleteAsset?(currentSrc: string): Promise<void>;
}

class WhiteboardNodeView implements NodeView {
  readonly dom: HTMLDivElement;
  private readonly view: EditorView;
  private readonly getPos: () => number | undefined;
  private readonly onSave: WhiteboardViewOptions["onSave"];
  private readonly onDeleteAsset?: WhiteboardViewOptions["onDeleteAsset"];
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

  constructor(
    initialNode: ProseNode,
    view: EditorView,
    getPos: () => number | undefined,
    options: WhiteboardViewOptions,
  ) {
    this.view = view;
    this.getPos = getPos;
    this.onSave = options.onSave;
    this.onDeleteAsset = options.onDeleteAsset;
    this.currentNode = initialNode;

    this.dom = document.createElement("div");
    this.dom.className = styles.node;
    this.dom.contentEditable = "false";
    this.dom.draggable = view.editable;

    this.preview = document.createElement("button");
    this.preview.type = "button";
    this.preview.className = styles.preview;
    this.preview.disabled = !view.editable;
    this.preview.draggable = view.editable;
    this.preview.title = "Doble clic para editar · arrastrar para mover";
    this.preview.setAttribute("aria-label", "Doble clic para editar el dibujo");
    this.preview.addEventListener("dblclick", (event) => {
      event.preventDefault();
      queueMicrotask(() => void this.startEditing());
    });
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
    this.updatePreview();
    if (initialNode.attrs.draft) queueMicrotask(() => void this.startEditing());
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.currentNode.type) return false;
    this.currentNode = node;
    this.preview.disabled = !this.view.editable;
    this.dom.draggable = this.view.editable;
    this.preview.draggable = this.view.editable;
    if (node.attrs.draft && !this.editing && !this.starting) queueMicrotask(() => void this.startEditing());
    if (!this.editing) this.updatePreview();
    return true;
  }

  selectNode(): void {
    this.dom.classList.add("ProseMirror-selectednode");
  }

  deselectNode(): void {
    this.dom.classList.remove("ProseMirror-selectednode");
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
    const view = drawingViewBox(shapes);
    const canRender = shapes.length > 0 || this.currentNode.attrs.draft;
    if (src && canRender) this.image.src = src;
    else this.image.removeAttribute("src");
    this.image.style.width = shapes.length ? `${Math.min(1_000, view.width)}px` : "";
    this.image.style.aspectRatio = shapes.length ? `${view.width} / ${view.height}` : "";
    // In the note a drawing is content, not a framed canvas. Empty drafts
    // remain available through the editor, but do not leave a blank board in
    // the document after closing it.
    const empty = !src || (!hasDrawingContent(svg) && !this.currentNode.attrs.draft);
    this.dom.classList.toggle(styles.empty, empty);
    this.preview.hidden = empty;
  }

  private async startEditing(): Promise<void> {
    const src = typeof this.currentNode.attrs.src === "string" ? this.currentNode.attrs.src : "";
    if (this.editing || this.starting || !src || !this.view.editable || this.view.isDestroyed) return;
    this.starting = true;
    try {
      const active = getActiveWhiteboard();
      if (active && active.id !== this.sessionId && !(await leaveEditor())) return;
      if (this.view.isDestroyed) return;
      this.editing = true;
      this.dom.classList.remove("ProseMirror-selectednode");
      this.preview.hidden = true;
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
      this.preview.hidden = false;
      this.updatePreview();
    } finally {
      this.starting = false;
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
    this.preview.hidden = false;
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

export function createWhiteboardView(options: WhiteboardViewOptions) {
  return $view(whiteboardNode.node, () => (node, view, getPos) =>
    new WhiteboardNodeView(node, view, getPos, options),
  );
}
