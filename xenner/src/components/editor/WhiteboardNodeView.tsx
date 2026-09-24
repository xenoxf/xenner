import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";
import { lazy, Suspense } from "solid-js";
import { render } from "solid-js/web";

import { drawingFromDataUrl } from "../../editor/drawing";
import { whiteboardNode } from "../../editor/whiteboard-node";
import styles from "../../styles/components/WhiteboardNodeView.module.css";
import type { DrawingTool } from "../../types/drawing";

const WhiteboardBlock = lazy(() =>
  import("./WhiteboardBlock").then((module) => ({ default: module.WhiteboardBlock })),
);

export interface WhiteboardViewOptions {
  onSave(svg: string, currentSrc: string): Promise<string | null>;
}

class WhiteboardNodeView implements NodeView {
  readonly dom: HTMLDivElement;
  private readonly view: EditorView;
  private readonly getPos: () => number | undefined;
  private readonly onSave: WhiteboardViewOptions["onSave"];
  private readonly preview: HTMLButtonElement;
  private readonly image: HTMLImageElement;
  private readonly editorHost: HTMLDivElement;
  private currentNode: ProseNode;
  private editing = false;
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
    this.currentNode = initialNode;

    this.dom = document.createElement("div");
    this.dom.className = styles.node;
    this.dom.contentEditable = "false";

    this.preview = document.createElement("button");
    this.preview.type = "button";
    this.preview.className = styles.preview;
    this.preview.setAttribute("aria-label", "Editar pizarra");
    this.preview.addEventListener("click", () => this.startEditing());

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
    if (initialNode.attrs.draft) queueMicrotask(() => this.startEditing());
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.currentNode.type) return false;
    this.currentNode = node;
    if (node.attrs.draft && !this.editing) queueMicrotask(() => this.startEditing());
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

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.stopEditing();
    this.dom.remove();
  }

  private updatePreview(): void {
    const src = typeof this.currentNode.attrs.src === "string" ? this.currentNode.attrs.src : "";
    this.image.src = src;
    this.preview.hidden = !src;
  }

  private startEditing(): void {
    const src = typeof this.currentNode.attrs.src === "string" ? this.currentNode.attrs.src : "";
    if (this.editing || !src) return;
    this.editing = true;
    this.preview.hidden = true;
    const tool = this.currentNode.attrs.tool;
    this.disposeEditor = render(
      () => (
        <Suspense fallback={<div class={styles.loading}>Preparando pizarra…</div>}>
          <WhiteboardBlock
            initialSvg={drawingFromDataUrl(src)}
            initialTool={tool as DrawingTool}
            onSave={(svg) => this.save(svg)}
            onCancel={() => this.cancel()}
          />
        </Suspense>
      ),
      this.editorHost,
    );
  }

  private stopEditing(): void {
    this.disposeEditor?.();
    this.disposeEditor = null;
    this.editorHost.replaceChildren();
    this.editing = false;
    this.preview.hidden = false;
    this.updatePreview();
  }

  private async save(svg: string): Promise<void> {
    const currentSrc = this.currentNode.attrs.src;
    const nextSrc = await this.onSave(svg, currentSrc);
    const pos = this.getPos();
    if (pos === undefined) return;
    const liveNode = this.view.state.doc.nodeAt(pos);
    if (!nextSrc || !liveNode || liveNode.attrs.src !== currentSrc) return;
    const attrs = { ...this.currentNode.attrs, src: nextSrc, draft: false, tool: "select" };
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
    this.currentNode = this.view.state.doc.nodeAt(pos) ?? this.currentNode;
    this.stopEditing();
  }

  private cancel(): void {
    if (!this.currentNode.attrs.draft) {
      this.stopEditing();
      return;
    }
    const pos = this.getPos();
    if (pos === undefined) {
      this.stopEditing();
      return;
    }
    const liveNode = this.view.state.doc.nodeAt(pos);
    if (!liveNode || liveNode.attrs.src !== this.currentNode.attrs.src) {
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
