import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import { DRAWING_TOOLS, isDrawingTool } from "../../data/drawing";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createDrawingId,
  createDrawingShape,
  DEFAULT_DRAWING_COLOR,
  drawingShapeBounds,
  drawingShapeHits,
  drawingViewBox,
  parseDrawingSvg,
  serializeDrawing,
} from "../../editor/drawing";
import styles from "../../styles/components/WhiteboardBlock.module.css";
import type { DrawingShape, DrawingTool, Point, ShapeKind } from "../../types/drawing";
import { Button } from "../ui/Button";
import {
  ArrowIcon,
  CircleIcon,
  CopyIcon,
  ExpandIcon,
  GridIcon,
  HandIcon,
  LineIcon,
  PencilIcon,
  SelectIcon,
  SquareIcon,
  TextIcon,
  TrashIcon,
} from "../ui/Icons";

export interface WhiteboardBlockProps {
  initialSvg?: string;
  initialTool?: DrawingTool;
  drawingId?: string;
  busy?: boolean;
  onSave(svg: string): void | boolean | Promise<void | boolean>;
  onCancel(): void;
  onChange?(svg: string): void;
  onDirtyChange?(dirty: boolean): void;
  onSavingChange?(saving: boolean): void;
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  id: string;
  start: Point;
  original: DrawingShape;
  before: DrawingShape[];
  moved: boolean;
}

interface PanState {
  clientX: number;
  clientY: number;
  view: ViewBox;
}

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface ResizeState {
  id: string;
  handle: ResizeHandle;
  start: Point;
  original: DrawingShape;
  before: DrawingShape[];
  moved: boolean;
}

interface TextEditState {
  id: string;
  value: string;
}

function ToolIcon(props: { tool: DrawingTool }) {
  if (props.tool === "select") return <SelectIcon />;
  if (props.tool === "hand") return <HandIcon />;
  if (props.tool === "pen") return <PencilIcon />;
  if (props.tool === "rect") return <SquareIcon />;
  if (props.tool === "ellipse") return <CircleIcon />;
  if (props.tool === "line") return <LineIcon />;
  if (props.tool === "arrow") return <ArrowIcon />;
  return <TextIcon />;
}

const MIN_EDITOR_WIDTH = 320;
const MIN_EDITOR_HEIGHT = 200;

function clamp(value: number, minimum = 0, maximum = CANVAS_WIDTH): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function editorViewForShapes(shapes: DrawingShape[]): { view: ViewBox; width: number; height: number } {
  const bounds = drawingViewBox(shapes);
  const width = clamp(bounds.width, MIN_EDITOR_WIDTH, CANVAS_WIDTH);
  let height = Math.max(MIN_EDITOR_HEIGHT, (bounds.height / Math.max(1, bounds.width)) * width);
  height = Math.min(CANVAS_HEIGHT, height);
  const x = clamp(bounds.x + bounds.width / 2 - width / 2, 0, Math.max(0, CANVAS_WIDTH - width));
  const y = clamp(bounds.y + bounds.height / 2 - height / 2, 0, Math.max(0, CANVAS_HEIGHT - height));
  return { view: { x, y, width, height }, width, height };
}

function isDegenerateDraft(shape: DrawingShape): boolean {
  if (shape.kind === "path") {
    return shape.points.length < 2 || shape.points.every((point) => point.x === shape.x1 && point.y === shape.y1);
  }
  return Math.abs(shape.x2 - shape.x1) < 1 && Math.abs(shape.y2 - shape.y1) < 1;
}

function cloneShapes(shapes: DrawingShape[]): DrawingShape[] {
  return shapes.map((shape) => ({
    ...shape,
    points: shape.points.map((point) => ({ ...point })),
  }));
}

function defaultDrawingColor(): string {
  if (typeof document === "undefined") return DEFAULT_DRAWING_COLOR;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--skin-toolbar-accent")
    .trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_DRAWING_COLOR;
}

function moveShape(shape: DrawingShape, dx: number, dy: number): DrawingShape {
  const x = clamp(shape.x1 + dx);
  const y = clamp(shape.y1 + dy, 0, CANVAS_HEIGHT);
  const boundedDx = x - shape.x1;
  const boundedDy = y - shape.y1;
  return {
    ...shape,
    x1: x,
    y1: y,
    x2: clamp(shape.x2 + boundedDx),
    y2: clamp(shape.y2 + boundedDy, 0, CANVAS_HEIGHT),
    points: shape.points.map((point) => ({
      x: clamp(point.x + boundedDx),
      y: clamp(point.y + boundedDy, 0, CANVAS_HEIGHT),
    })),
  };
}

function resizeShape(shape: DrawingShape, handle: ResizeHandle, dx: number, dy: number): DrawingShape {
  if (shape.kind === "text") {
    return { ...shape, x1: clamp(shape.x1 + dx), y1: clamp(shape.y1 + dy, 0, CANVAS_HEIGHT) };
  }
  const west = handle.includes("w");
  const north = handle.includes("n");
  const oppositeX = west ? shape.x2 : shape.x1;
  const oppositeY = north ? shape.y2 : shape.y1;
  let nextX1 = west ? clamp(shape.x1 + dx) : shape.x1;
  let nextY1 = north ? clamp(shape.y1 + dy, 0, CANVAS_HEIGHT) : shape.y1;
  let nextX2 = west ? shape.x2 : clamp(shape.x2 + dx);
  let nextY2 = north ? shape.y2 : clamp(shape.y2 + dy, 0, CANVAS_HEIGHT);
  if (nextX2 - nextX1 < 2) {
    if (west) nextX1 = nextX2 - 2;
    else nextX2 = nextX1 + 2;
  }
  if (nextY2 - nextY1 < 2) {
    if (north) nextY1 = nextY2 - 2;
    else nextY2 = nextY1 + 2;
  }
  const scaleX = (value: number): number =>
    oppositeX + ((value - oppositeX) * Math.max(2, nextX2 - nextX1)) / Math.max(2, Math.abs(shape.x2 - shape.x1));
  const scaleY = (value: number): number =>
    oppositeY + ((value - oppositeY) * Math.max(2, nextY2 - nextY1)) / Math.max(2, Math.abs(shape.y2 - shape.y1));
  return {
    ...shape,
    x1: nextX1,
    y1: nextY1,
    x2: nextX2,
    y2: nextY2,
    points: shape.points.map((point) => ({ x: scaleX(point.x), y: scaleY(point.y) })),
  };
}

function duplicateShape(shape: DrawingShape): DrawingShape {
  const offset = 24;
  const point = {
    x: clamp(shape.x1 + offset),
    y: clamp(shape.y1 + offset, 0, CANVAS_HEIGHT),
  };
  const copy = createDrawingShape(shape.kind, point, shape.color, shape.width);
  copy.x2 = clamp(shape.x2 + offset);
  copy.y2 = clamp(shape.y2 + offset, 0, CANVAS_HEIGHT);
  copy.points = shape.points.map((item) => ({
    x: clamp(item.x + offset),
    y: clamp(item.y + offset, 0, CANVAS_HEIGHT),
  }));
  copy.text = shape.text;
  return copy;
}

export function WhiteboardBlock(props: WhiteboardBlockProps) {
  const initialShapes = parseDrawingSvg(props.initialSvg ?? "");
  const initialEditor = editorViewForShapes(initialShapes);
  const initialDrawingId = props.drawingId ?? createDrawingId();
  const [drawingId] = createSignal(initialDrawingId);
  const initialTool = isDrawingTool(props.initialTool) ? props.initialTool : "pen";
  const [tool, setTool] = createSignal<DrawingTool>(initialTool);
  const [color, setColor] = createSignal(initialShapes[0]?.color ?? defaultDrawingColor());
  const [width, setWidth] = createSignal(initialShapes[0]?.width ?? 4);
  const [shapes, setShapes] = createSignal<DrawingShape[]>(initialShapes);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal<DrawingShape | null>(null);
  const [drag, setDrag] = createSignal<DragState | null>(null);
  const [resize, setResize] = createSignal<ResizeState | null>(null);
  const [pan, setPan] = createSignal<PanState | null>(null);
  const [undoStack, setUndoStack] = createSignal<DrawingShape[][]>([]);
  const [redoStack, setRedoStack] = createSignal<DrawingShape[][]>([]);
  const [saving, setSaving] = createSignal(false);
  const [view, setView] = createSignal<ViewBox>(initialEditor.view);
  const [gridVisible, setGridVisible] = createSignal(true);
  const [expanded, setExpanded] = createSignal(false);
  const [textEdit, setTextEdit] = createSignal<TextEditState | null>(null);
  const markerPrefix = `inline-arrowhead-${createUniqueId()}`;
  let block: HTMLElement | undefined;
  let canvas: SVGSVGElement | undefined;
  let canvasWrap: HTMLDivElement | undefined;
  let canvasStage: HTMLDivElement | undefined;
  let textInput: HTMLInputElement | undefined;
  let expandedCanvasObserver: ResizeObserver | null = null;
  let styleBefore: DrawingShape[] | null = null;
  let textBefore: DrawingShape[] | null = null;

  const selectedShape = createMemo(() => shapes().find((shape) => shape.id === selectedId()) ?? null);
  const zoomPercent = createMemo(() => Math.round((initialEditor.width / view().width) * 100));

  function fitExpandedCanvas(): void {
    if (!expanded() || !canvasWrap || !canvasStage) return;
    const style = getComputedStyle(canvasWrap);
    const availableWidth = Math.max(
      1,
      canvasWrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    );
    const availableHeight = Math.max(
      1,
      canvasWrap.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    );
    const ratio = initialEditor.width / Math.max(1, initialEditor.height);
    const width = Math.max(1, Math.floor(Math.min(availableWidth, availableHeight * ratio)));
    canvasStage.style.width = `${width}px`;
    canvasStage.style.height = `${width / ratio}px`;
  }

  function resetExpandedCanvasSize(): void {
    if (!canvasStage) return;
    if (expanded()) {
      fitExpandedCanvas();
      return;
    }
    canvasStage.style.width = "";
    canvasStage.style.height = "";
  }

  onMount(() => {
    queueMicrotask(() => block?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }));
    if (typeof ResizeObserver !== "undefined" && canvasWrap) {
      expandedCanvasObserver = new ResizeObserver(() => {
        if (expanded()) fitExpandedCanvas();
      });
      expandedCanvasObserver.observe(canvasWrap);
    }
  });

  createEffect(() => {
    expanded();
    queueMicrotask(resetExpandedCanvasSize);
  });

  onCleanup(() => expandedCanvasObserver?.disconnect());

  function capturePointer(event: PointerEvent): void {
    try {
      canvas?.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded WebViews can reject capture for a cancelled pointer;
      // the regular pointer handlers still finish the gesture safely.
    }
  }

  function releasePointer(event: PointerEvent): void {
    try {
      if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch {
      // The capture may already have been released by the WebView.
    }
  }

  function ensureContentVisible(nextShapes: DrawingShape[]): void {
    const bounds = drawingViewBox(nextShapes);
    const current = view();
    const width = Math.max(current.width, bounds.width);
    const height = Math.max(current.height, bounds.height);
    const containsBounds =
      bounds.x >= current.x &&
      bounds.y >= current.y &&
      bounds.x + bounds.width <= current.x + current.width &&
      bounds.y + bounds.height <= current.y + current.height;
    if (width <= current.width && height <= current.height && containsBounds) return;
    const centerX = current.x + current.width / 2;
    const centerY = current.y + current.height / 2;
    setView({
      x: clamp(centerX - width / 2, 0, Math.max(0, CANVAS_WIDTH - width)),
      y: clamp(centerY - height / 2, 0, Math.max(0, CANVAS_HEIGHT - height)),
      width,
      height,
    });
  }

  function currentSvg(nextShapes = shapes()): string {
    return serializeDrawing(nextShapes, drawingId());
  }

  function markDirty(next = shapes()): void {
    props.onDirtyChange?.(true);
    props.onChange?.(currentSvg(next));
  }

  function pointFromEvent(event: PointerEvent): Point {
    const rect = canvas!.getBoundingClientRect();
    const currentView = view();
    return {
      x: clamp(currentView.x + ((event.clientX - rect.left) / rect.width) * currentView.width),
      y: clamp(
        currentView.y + ((event.clientY - rect.top) / rect.height) * currentView.height,
        0,
        CANVAS_HEIGHT,
      ),
    };
  }

  function commit(next: DrawingShape[]): void {
    setUndoStack((previous) => [...previous, cloneShapes(shapes())]);
    setRedoStack([]);
    setShapes(next);
    ensureContentVisible(next);
    markDirty(next);
  }

  function onPointerDown(event: PointerEvent): void {
    if (saving() || event.button !== 0) return;
    // The canvas is a custom editor, not a native drag surface. Consuming
    // the pointer keeps ProseMirror and the browser from selecting/scrolling
    // the note while a figure is being drawn.
    event.preventDefault();
    event.stopPropagation();
    canvas?.focus({ preventScroll: true });
    const point = pointFromEvent(event);
    const currentTool = tool();
    const resizeHandle = event.target instanceof Element
      ? event.target.getAttribute("data-resize-handle")
      : null;
    const selected = selectedShape();
    if (currentTool === "select" && resizeHandle && selected && ["nw", "ne", "sw", "se"].includes(resizeHandle)) {
      setResize({
        id: selected.id,
        handle: resizeHandle as ResizeHandle,
        start: point,
        original: { ...selected, points: selected.points.map((item) => ({ ...item })) },
        before: cloneShapes(shapes()),
        moved: false,
      });
      capturePointer(event);
      return;
    }
    if (currentTool === "hand") {
      setPan({ clientX: event.clientX, clientY: event.clientY, view: view() });
      capturePointer(event);
      return;
    }
    if (currentTool === "select") {
      const hit = [...shapes()].reverse().find((shape) => drawingShapeHits(shape, point));
      setSelectedId(hit?.id ?? null);
      if (hit) {
        setDrag({
          id: hit.id,
          start: point,
          original: { ...hit, points: hit.points.map((item) => ({ ...item })) },
          before: cloneShapes(shapes()),
          moved: false,
        });
        capturePointer(event);
      }
      return;
    }
    if (currentTool === "text") {
      const selected = selectedShape();
      if (selected?.kind === "text" && drawingShapeHits(selected, point)) {
        startTextEditor(selected);
        return;
      }
      const shape = createDrawingShape("text", point, color(), width());
      shape.text = "Texto";
      commit([...shapes(), shape]);
      setSelectedId(shape.id);
      startTextEditor(shape);
      return;
    }
    const kind: ShapeKind = currentTool === "pen" ? "path" : currentTool;
    setDraft(createDrawingShape(kind, point, color(), width()));
    capturePointer(event);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pan() && !resize() && !drag() && !draft()) return;
    event.preventDefault();
    event.stopPropagation();
    const activePan = pan();
    if (activePan) {
      const rect = canvas!.getBoundingClientRect();
      const dx = ((event.clientX - activePan.clientX) / rect.width) * activePan.view.width;
      const dy = ((event.clientY - activePan.clientY) / rect.height) * activePan.view.height;
      setView({
        ...activePan.view,
        x: clamp(activePan.view.x - dx, 0, Math.max(0, CANVAS_WIDTH - activePan.view.width)),
        y: clamp(
          activePan.view.y - dy,
          0,
          Math.max(0, CANVAS_HEIGHT - activePan.view.height),
        ),
      });
      return;
    }
    const activeResize = resize();
    if (activeResize) {
      const point = pointFromEvent(event);
      const dx = point.x - activeResize.start.x;
      const dy = point.y - activeResize.start.y;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        setResize({ ...activeResize, moved: true });
        setShapes((previous) =>
          previous.map((shape) =>
            shape.id === activeResize.id
              ? resizeShape(activeResize.original, activeResize.handle, dx, dy)
              : shape,
          ),
        );
      }
      return;
    }
    const activeDrag = drag();
    if (activeDrag) {
      const point = pointFromEvent(event);
      const dx = point.x - activeDrag.start.x;
      const dy = point.y - activeDrag.start.y;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        setDrag({ ...activeDrag, moved: true });
        setShapes((previous) =>
          previous.map((shape) =>
            shape.id === activeDrag.id ? moveShape(activeDrag.original, dx, dy) : shape,
          ),
        );
      }
      return;
    }
    const activeDraft = draft();
    if (!activeDraft) return;
    const point = pointFromEvent(event);
    setDraft({
      ...activeDraft,
      x2: point.x,
      y2: point.y,
      points: activeDraft.kind === "path" ? [...activeDraft.points, point] : activeDraft.points,
    });
  }

  function onPointerCancel(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const activeResize = resize();
    if (activeResize) {
      setShapes(activeResize.before);
      setResize(null);
    }
    const activeDrag = drag();
    if (activeDrag) {
      setShapes(activeDrag.before);
      setDrag(null);
    }
    if (pan()) setPan(null);
    if (draft()) setDraft(null);
    releasePointer(event);
  }

  function onPointerUp(event: PointerEvent): void {
    if (pan() || resize() || drag() || draft()) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (pan()) {
      releasePointer(event);
      setPan(null);
      return;
    }
    const activeResize = resize();
    if (activeResize) {
      releasePointer(event);
      if (activeResize.moved) {
        setUndoStack((previous) => [...previous, activeResize.before]);
        setRedoStack([]);
        ensureContentVisible(shapes());
        markDirty();
      }
      setResize(null);
      return;
    }
    const activeDrag = drag();
    if (activeDrag) {
      releasePointer(event);
      if (activeDrag.moved) {
        setUndoStack((previous) => [...previous, activeDrag.before]);
        setRedoStack([]);
        ensureContentVisible(shapes());
        markDirty();
      }
      setDrag(null);
      return;
    }
    const activeDraft = draft();
    if (!activeDraft) return;
    releasePointer(event);
    if (isDegenerateDraft(activeDraft)) {
      setDraft(null);
      return;
    }
    commit([...shapes(), activeDraft]);
    setSelectedId(activeDraft.id);
    setDraft(null);
  }

  function deleteSelected(): void {
    const id = selectedId();
    if (!id) return;
    commit(shapes().filter((shape) => shape.id !== id));
    setSelectedId(null);
  }

  function duplicateSelected(): void {
    const selected = selectedShape();
    if (!selected) return;
    const copy = duplicateShape(selected);
    commit([...shapes(), copy]);
    setSelectedId(copy.id);
  }

  function undo(): void {
    const history = undoStack();
    const previous = history[history.length - 1];
    if (!previous) return;
    setRedoStack((redo) => [...redo, cloneShapes(shapes())]);
    setUndoStack(history.slice(0, -1));
    setShapes(previous);
    setSelectedId(null);
    markDirty(previous);
  }

  function redo(): void {
    const history = redoStack();
    const next = history[history.length - 1];
    if (!next) return;
    setUndoStack((undoHistory) => [...undoHistory, cloneShapes(shapes())]);
    setRedoStack(history.slice(0, -1));
    setShapes(next);
    setSelectedId(null);
    markDirty(next);
  }

  function beginStyleChange(): void {
    if (!styleBefore) styleBefore = cloneShapes(shapes());
  }

  function updateSelectedStyle(nextColor: string, nextWidth: number): void {
    setColor(nextColor);
    setWidth(nextWidth);
    const id = selectedId();
    if (!id) return;
    beginStyleChange();
    const next = shapes().map((shape) =>
      shape.id === id ? { ...shape, color: nextColor, width: nextWidth } : shape,
    );
    setShapes(next);
    markDirty(next);
  }

  function finishStyleChange(): void {
    if (!styleBefore) return;
    const before = styleBefore;
    styleBefore = null;
    setUndoStack((previous) => [...previous, before]);
    setRedoStack([]);
  }

  function chooseTool(nextTool: DrawingTool): void {
    if (textEdit()) finishTextEditor();
    setTool(nextTool);
  }

  function startTextEditor(shape: DrawingShape): void {
    textBefore = cloneShapes(shapes());
    setTextEdit({ id: shape.id, value: shape.text });
    queueMicrotask(() => textInput?.focus({ preventScroll: true }));
  }

  function updateText(value: string): void {
    const edit = textEdit();
    if (!edit) return;
    setTextEdit({ ...edit, value });
    const next = shapes().map((shape) => (shape.id === edit.id ? { ...shape, text: value } : shape));
    setShapes(next);
    markDirty(next);
  }

  function finishTextEditor(): void {
    const edit = textEdit();
    if (!edit) return;
    if (textBefore) {
      const before = textBefore;
      textBefore = null;
      setUndoStack((previous) => [...previous, before]);
      setRedoStack([]);
    }
    setTextEdit(null);
    textInput = undefined;
    ensureContentVisible(shapes());
    if (edit.value.trim() === "") {
      const next = shapes().filter((shape) => shape.id !== edit.id);
      setShapes(next);
      setSelectedId(null);
      ensureContentVisible(next);
      markDirty(next);
    }
  }

  function cancelTextEditor(): void {
    const edit = textEdit();
    if (!edit) return;
    if (textBefore) {
      setShapes(textBefore);
      setSelectedId(null);
      markDirty(textBefore);
      textBefore = null;
    }
    setTextEdit(null);
    textInput = undefined;
  }

  function onDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event as unknown as PointerEvent);
    const hit = [...shapes()].reverse().find((shape) => drawingShapeHits(shape, point));
    if (hit?.kind === "text") {
      setSelectedId(hit.id);
      startTextEditor(hit);
    }
  }

  function zoom(factor: number): void {
    const current = view();
    const minimumWidth = Math.max(200, initialEditor.width / 2);
    const maximumWidth = Math.min(CANVAS_WIDTH, Math.max(initialEditor.width * 2, CANVAS_WIDTH));
    let width = clamp(current.width / factor, minimumWidth, maximumWidth);
    let height = width * (initialEditor.height / initialEditor.width);
    if (height > CANVAS_HEIGHT) {
      height = CANVAS_HEIGHT;
      width = Math.min(CANVAS_WIDTH, height * (initialEditor.width / initialEditor.height));
    }
    const centerX = current.x + current.width / 2;
    const centerY = current.y + current.height / 2;
    setView({
      x: clamp(centerX - width / 2, 0, Math.max(0, CANVAS_WIDTH - width)),
      y: clamp(centerY - height / 2, 0, Math.max(0, CANVAS_HEIGHT - height)),
      width,
      height,
    });
  }

  function resetView(): void {
    setView(initialEditor.view);
  }

  function moveToolFocus(event: KeyboardEvent, container: HTMLElement): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const controls = [...container.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = controls.length - 1;
    else if (event.key === "ArrowRight") next = (Math.max(current, 0) + 1) % controls.length;
    else next = (Math.max(current, 0) - 1 + controls.length) % controls.length;
    event.preventDefault();
    event.stopPropagation();
    controls[next]?.focus({ preventScroll: true });
  }

  function nudgeSelected(event: KeyboardEvent): boolean {
    const selected = selectedShape();
    if (!selected || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return false;
    const amount = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
    const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
    commit(shapes().map((shape) => (shape.id === selected.id ? moveShape(shape, dx, dy) : shape)));
    return true;
  }

  async function save(): Promise<void> {
    if (saving()) return;
    setSaving(true);
    props.onSavingChange?.(true);
    try {
      await props.onSave(currentSvg());
    } finally {
      setSaving(false);
      props.onSavingChange?.(false);
    }
  }

  return (
    <section
      ref={(element) => (block = element)}
      class={`${styles.block} ${expanded() ? styles.expanded : ""}`}
      aria-label="Editor de pizarra"
      aria-busy={saving()}
      onKeyDown={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          if (event.key === "Escape" && textEdit()) {
            event.preventDefault();
            cancelTextEditor();
          }
          return;
        }
        if (event.key === "Escape" && expanded() && !textEdit()) {
          event.preventDefault();
          setExpanded(false);
          return;
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          event.shiftKey ? redo() : undo();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
          event.preventDefault();
          duplicateSelected();
        } else if (nudgeSelected(event)) {
          event.preventDefault();
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          deleteSelected();
        } else if (event.key === "Escape") {
          if (textEdit()) cancelTextEditor();
          else if (!saving()) props.onCancel();
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          zoom(1.15);
        } else if (event.key === "-") {
          event.preventDefault();
          zoom(0.87);
        }
      }}
    >
      <div
        class={styles.toolbar}
        role="toolbar"
        aria-orientation="horizontal"
        aria-label="Herramientas de pizarra"
        onKeyDown={(event) => moveToolFocus(event, event.currentTarget)}
      >
        <div class={styles.toolGroup} role="group" aria-label="Herramientas">
          <For each={DRAWING_TOOLS}>
            {(item) => (
              <button
                type="button"
                class={tool() === item.id ? styles.active : styles.toolButton}
                aria-label={item.label}
                aria-pressed={tool() === item.id}
                aria-keyshortcuts={item.id === "select" ? "Escape" : undefined}
                title={item.label}
                onClick={() => chooseTool(item.id)}
              >
                <ToolIcon tool={item.id} />
              </button>
            )}
          </For>
        </div>
        <div class={styles.styleControls}>
          <label class={styles.color}>
            <span>Color</span>
            <input
              type="color"
              value={color()}
              aria-label="Color de la herramienta"
              onInput={(event) => updateSelectedStyle(event.currentTarget.value, width())}
              onChange={finishStyleChange}
            />
          </label>
          <label class={styles.widthControl}>
            <span>Grosor</span>
            <input
              type="range"
              min="1"
              max="16"
              value={width()}
              aria-label="Grosor de la herramienta"
              onInput={(event) => updateSelectedStyle(color(), Number(event.currentTarget.value))}
              onChange={finishStyleChange}
            />
          </label>
        </div>
        <div class={styles.canvasControls} role="group" aria-label="Controles del lienzo">
          <button type="button" onClick={() => zoom(0.87)} aria-label="Alejar" title="Alejar">−</button>
          <button type="button" class={styles.zoomLabel} onClick={resetView} title="Restablecer zoom">
            {zoomPercent()}%
          </button>
          <button type="button" onClick={() => zoom(1.15)} aria-label="Acercar" title="Acercar">+</button>
          <button
            type="button"
            class={gridVisible() ? styles.activeControl : undefined}
            aria-label="Mostrar u ocultar cuadrícula"
            aria-pressed={gridVisible()}
            title="Cuadrícula"
            onClick={() => setGridVisible((value) => !value)}
          >
            <GridIcon />
          </button>
        </div>
        <div class={styles.toolbarActions}>
          <button type="button" disabled={undoStack().length === 0} onClick={undo} title="Deshacer (Ctrl+Z)">↶</button>
          <button type="button" disabled={redoStack().length === 0} onClick={redo} title="Rehacer (Ctrl+Shift+Z)">↷</button>
          <button type="button" disabled={!selectedId()} onClick={duplicateSelected} aria-label="Duplicar figura" title="Duplicar (Ctrl+D)">
            <CopyIcon />
          </button>
          <button
            type="button"
            class={styles.deleteButton}
            disabled={!selectedId()}
            onClick={deleteSelected}
            aria-label="Eliminar figura"
            title="Eliminar"
          >
            <TrashIcon />
          </button>
          <button
            type="button"
            class={expanded() ? styles.activeControl : undefined}
            aria-label={expanded() ? "Cerrar lienzo grande" : "Abrir lienzo grande"}
            aria-pressed={expanded()}
            title="Abrir en grande"
            onClick={() => setExpanded((value) => !value)}
          >
            <ExpandIcon />
          </button>
          <Button onClick={props.onCancel} disabled={saving()}>Cerrar</Button>
          <Button variant="primary" disabled={saving() || props.busy} onClick={() => void save()}>
            {saving() || props.busy ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
      <div
        ref={(element) => (canvasWrap = element)}
        class={`${styles.canvasWrap} ${gridVisible() ? styles.grid : ""}`}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div
          ref={(element) => (canvasStage = element)}
          class={styles.canvasStage}
          style={`--canvas-editor-width: ${initialEditor.width}px; --canvas-editor-ratio: ${initialEditor.width} / ${initialEditor.height};`}
        >
          <svg
            ref={(element) => (canvas = element)}
            class={styles.canvas}
            viewBox={`${view().x} ${view().y} ${view().width} ${view().height}`}
            preserveAspectRatio="none"
            style={`width: 100%; height: 100%; cursor:${tool() === "hand" ? (pan() ? "grabbing" : "grab") : tool() === "select" ? "default" : "crosshair"};`}
          role="application"
          aria-label="Lienzo de la pizarra"
          tabindex="0"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onDblClick={onDoubleClick}
          onWheel={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!event.ctrlKey && !event.metaKey) return;
            zoom(event.deltaY < 0 ? 1.1 : 0.9);
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <defs>
            <For each={shapes().filter((shape) => shape.kind === "arrow")}>
              {(shape) => (
                <marker
                  id={`${markerPrefix}-${shape.id}`}
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill={shape.color} />
                </marker>
              )}
            </For>
          </defs>
          <For each={shapes()}>
            {(shape) => (
              <>
                {shape.kind === "rect" && <rect x={Math.min(shape.x1, shape.x2)} y={Math.min(shape.y1, shape.y2)} width={Math.abs(shape.x2 - shape.x1)} height={Math.abs(shape.y2 - shape.y1)} fill="none" stroke={shape.color} stroke-width={shape.width} />}
                {shape.kind === "ellipse" && <ellipse cx={(shape.x1 + shape.x2) / 2} cy={(shape.y1 + shape.y2) / 2} rx={Math.abs(shape.x2 - shape.x1) / 2} ry={Math.abs(shape.y2 - shape.y1) / 2} fill="none" stroke={shape.color} stroke-width={shape.width} />}
                {shape.kind === "line" && <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={shape.color} stroke-width={shape.width} stroke-linecap="round" />}
                {shape.kind === "arrow" && <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={shape.color} stroke-width={shape.width} stroke-linecap="round" marker-end={`url(#${markerPrefix}-${shape.id})`} />}
                {shape.kind === "path" && <polyline points={shape.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={shape.color} stroke-width={shape.width} stroke-linecap="round" stroke-linejoin="round" />}
                {shape.kind === "text" && <text x={shape.x1} y={shape.y1} fill={shape.color} font-family="sans-serif" font-size="24">{shape.text}</text>}
              </>
            )}
          </For>
          <Show when={draft()}>
            {(shape) => (
              <>
                {shape().kind === "rect" && <rect x={Math.min(shape().x1, shape().x2)} y={Math.min(shape().y1, shape().y2)} width={Math.abs(shape().x2 - shape().x1)} height={Math.abs(shape().y2 - shape().y1)} fill="none" stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
                {shape().kind === "ellipse" && <ellipse cx={(shape().x1 + shape().x2) / 2} cy={(shape().y1 + shape().y2) / 2} rx={Math.abs(shape().x2 - shape().x1) / 2} ry={Math.abs(shape().y2 - shape().y1) / 2} fill="none" stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
                {shape().kind === "line" && <line x1={shape().x1} y1={shape().y1} x2={shape().x2} y2={shape().y2} stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
                {shape().kind === "arrow" && <line x1={shape().x1} y1={shape().y1} x2={shape().x2} y2={shape().y2} stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
                {shape().kind === "path" && <polyline points={shape().points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
              </>
            )}
          </Show>
          <For each={shapes().filter((shape) => shape.id === selectedId())}>
            {(shape) => {
              const box = drawingShapeBounds(shape);
              const handles = [
                { id: "nw" as const, x: box.x - 12, y: box.y - 12 },
                { id: "ne" as const, x: box.x + box.width + 4, y: box.y - 12 },
                { id: "sw" as const, x: box.x - 12, y: box.y + box.height + 4 },
                { id: "se" as const, x: box.x + box.width + 4, y: box.y + box.height + 4 },
              ];
              return (
                <>
                  <rect x={box.x - 8} y={box.y - 8} width={box.width + 16} height={box.height + 16} fill="none" stroke={shape.color} stroke-width="2" stroke-dasharray="6 5" pointer-events="none" />
                  <For each={handles}>
                    {(handle) => (
                      <rect
                        data-resize-handle={handle.id}
                        x={handle.x}
                        y={handle.y}
                        width="8"
                        height="8"
                        rx="2"
                        fill={shape.color}
                        stroke="var(--skin-note-background)"
                        stroke-width="1"
                        pointer-events="all"
                      />
                    )}
                  </For>
                </>
              );
            }}
          </For>
          </svg>
          <Show when={textEdit()}>
          {(edit) => {
            const shape = () => shapes().find((candidate) => candidate.id === edit().id);
            const position = () => {
              const current = shape();
              const currentView = view();
              if (!current) return { left: "50%", top: "50%" };
              return {
                left: `${((current.x1 - currentView.x) / currentView.width) * 100}%`,
                top: `${((current.y1 - currentView.y) / currentView.height) * 100}%`,
              };
            };
            return (
              <input
                ref={(element) => (textInput = element)}
                class={styles.textEditor}
                style={`left:${position().left};top:${position().top};`}
                value={edit().value}
                aria-label="Editar texto del dibujo"
                onInput={(event) => updateText(event.currentTarget.value)}
                onBlur={finishTextEditor}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    finishTextEditor();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancelTextEditor();
                  }
                }}
              />
            );
          }}
          </Show>
        </div>
        <Show when={saving()}>
          <span class="sr-only" role="status">Guardando pizarra…</span>
        </Show>
      </div>
    </section>
  );
}
