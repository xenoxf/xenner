import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type {
  EditorView,
  NodeView,
  ViewMutationRecord,
} from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";
import { createUniqueId, lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";

import {
  drawingFromDataUrl,
  drawingIdFromSvg,
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
  private dirty = false;
  private latestSvg = "";
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private persistPromise: Promise<boolean> | null = null;
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

    this.preview = document.createElement("button");
    this.preview.type = "button";
    this.preview.className = styles.preview;
    this.preview.disabled = !view.editable;
    this.preview.setAttribute("aria-label", "Editar pizarra");
    this.preview.addEventListener("click", () => void this.startEditing());

    this.image = document.createElement("img");
    this.image.alt = "Pizarra";
    this.image.draggable = false;
    const label = document.createElement("span");
    label.className = styles.previewLabel;
    label.textContent = "Editar dibujo";
    this.preview.append(this.image, label);

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
    if (node.attrs.draft && !this.editing) queueMicrotask(() => void this.startEditing());
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
    return this.editing && event.target instanceof Node && this.editorHost.contains(event.target);
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.type !== "selection";
  }

  destroy(): void {
    if (this.dirty) void this.saveLatest(true);
    this.stopEditing();
    this.dom.remove();
  }

  private updatePreview(): void {
    const src = typeof this.currentNode.attrs.src === "string" ? this.currentNode.attrs.src : "";
    this.image.src = src;
    this.preview.hidden = !src;
  }

  private async startEditing(): Promise<void> {
    const src = typeof this.currentNode.attrs.src === "string" ? this.currentNode.attrs.src : "";
    if (this.editing || !src || !this.view.editable || this.view.isDestroyed) return;
    const active = getActiveWhiteboard();
    if (active && active.id !== this.sessionId && !(await leaveEditor())) return;
    if (this.view.isDestroyed) return;
    this.editing = true;
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
        <Suspense fallback={<div class={styles.loading}>Preparando pizarra…</div>}>
          <WhiteboardBlock
            initialSvg={this.latestSvg}
            initialTool={tool as DrawingTool}
            drawingId={drawingId}
            onChange={(svg) => this.changed(svg)}
            onDirtyChange={(dirty) => this.setDirty(dirty)}
            onSavingChange={(saving) => updateWhiteboardSession(this.sessionId, { saving })}
            onSave={(svg) => this.persist(svg, true)}
            onCancel={() => void this.cancel()}
          />
        </Suspense>
      ),
      this.editorHost,
    );
  }

  private changed(svg: string): void {
    this.latestSvg = svg;
    this.setDirty(true);
  }

  private setDirty(dirty: boolean): void {
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
      if (!this.view.isDestroyed) this.preview.focus();
    });
  }

  private async saveLatest(closeAfter: boolean): Promise<boolean> {
    if (!this.dirty && !closeAfter) return true;
    if (this.persistPromise) return this.persistPromise;
    const svg = this.latestSvg;
    this.persistPromise = this.persist(svg, closeAfter).finally(() => {
      this.persistPromise = null;
      updateWhiteboardSession(this.sessionId, { saving: false });
    });
    return this.persistPromise;
  }

  private async persist(svg: string, closeAfter: boolean): Promise<boolean> {
    const currentSrc = this.currentNode.attrs.src;
    const currentDrawingId =
      typeof this.currentNode.attrs.drawingId === "string" ? this.currentNode.attrs.drawingId : "";
    const nextDrawingId = drawingIdFromSvg(svg);
    const copy = Boolean(currentDrawingId && nextDrawingId && currentDrawingId !== nextDrawingId)
      || !currentDrawingId;
    const nextSrc = await this.onSave(svg, currentSrc, { notify: closeAfter, copy });
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
    this.latestSvg = svg;
    this.dirty = false;
    updateWhiteboardSession(this.sessionId, { dirty: false, saving: false });
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    if (closeAfter) this.stopEditing();
    return true;
  }

  private async cancel(): Promise<void> {
    if (!this.currentNode.attrs.draft) {
      if (this.dirty) await this.saveLatest(true);
      else this.stopEditing();
      return;
    }
    const currentSrc = this.currentNode.attrs.src;
    if (this.onDeleteAsset && this.currentNode.attrs.drawingId) {
      try {
        await this.onDeleteAsset(currentSrc);
      } catch {
        return;
      }
    }
    const pos = this.getPos();
    if (pos === undefined) {
      this.stopEditing();
      return;
    }
    const liveNode = this.view.state.doc.nodeAt(pos);
    if (!liveNode || liveNode.attrs.src !== currentSrc) {
      this.stopEditing();
      return;
    }
    this.stopEditing();
    this.view.dispatch(this.view.state.tr.delete(pos, pos + liveNode.nodeSize));
  }
}

export function createWhiteboardView(options: WhiteboardViewOptions) {
  return $view(whiteboardNode.node, () => (node, view, getPos) =>
    new WhiteboardNodeView(node, view, getPos, options),
  );
}
