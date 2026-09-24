import { createSignal, createUniqueId, For, onMount, Show } from "solid-js";

import { DRAWING_TOOLS } from "../../data/drawing";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createDrawingShape,
  DEFAULT_DRAWING_COLOR,
  drawingShapeBounds,
  drawingShapeHits,
  parseDrawingSvg,
  serializeDrawing,
} from "../../editor/drawing";
import styles from "../../styles/components/WhiteboardBlock.module.css";
import type { DrawingShape, DrawingTool, Point, ShapeKind } from "../../types/drawing";
import { Button } from "../ui/Button";
import {
  ArrowIcon,
  CircleIcon,
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
  busy?: boolean;
  onSave(svg: string): void | Promise<void>;
  onCancel(): void;
}

function ToolIcon(props: { tool: DrawingTool }) {
  if (props.tool === "select") return <SelectIcon />;
  if (props.tool === "pen") return <PencilIcon />;
  if (props.tool === "rect") return <SquareIcon />;
  if (props.tool === "ellipse") return <CircleIcon />;
  if (props.tool === "line") return <LineIcon />;
  if (props.tool === "arrow") return <ArrowIcon />;
  return <TextIcon />;
}

export function WhiteboardBlock(props: WhiteboardBlockProps) {
  const initialShapes = parseDrawingSvg(props.initialSvg ?? "");
  const [tool, setTool] = createSignal<DrawingTool>(props.initialTool ?? "pen");
  const [color, setColor] = createSignal(initialShapes[0]?.color ?? DEFAULT_DRAWING_COLOR);
  const [width, setWidth] = createSignal(initialShapes[0]?.width ?? 4);
  const [shapes, setShapes] = createSignal<DrawingShape[]>(initialShapes);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal<DrawingShape | null>(null);
  const [drag, setDrag] = createSignal<{ id: string; start: Point; original: DrawingShape } | null>(null);
  const [undoStack, setUndoStack] = createSignal<DrawingShape[][]>([]);
  const [redoStack, setRedoStack] = createSignal<DrawingShape[][]>([]);
  const [saving, setSaving] = createSignal(false);
  const markerId = `inline-arrowhead-${createUniqueId()}`;
  let block: HTMLElement | undefined;
  let canvas: SVGSVGElement | undefined;

  onMount(() => queueMicrotask(() => block?.querySelector<HTMLButtonElement>("button")?.focus()));

  function pointFromEvent(event: PointerEvent): Point {
    const rect = canvas!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(CANVAS_WIDTH, ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT)),
    };
  }

  function commit(next: DrawingShape[]): void {
    setUndoStack((previous) => [...previous, shapes()]);
    setRedoStack([]);
    setShapes(next);
  }

  function onPointerDown(event: PointerEvent): void {
    if (saving()) return;
    const point = pointFromEvent(event);
    const currentTool = tool();
    if (currentTool === "select") {
      const hit = [...shapes()].reverse().find((shape) => drawingShapeHits(shape, point));
      setSelectedId(hit?.id ?? null);
      if (hit) setDrag({ id: hit.id, start: point, original: { ...hit, points: [...hit.points] } });
      return;
    }
    if (currentTool === "text") {
      const text = window.prompt("Texto del dibujo", "Texto")?.trim();
      if (!text) return;
      const shape = createDrawingShape("text", point, color(), width());
      commit([...shapes(), { ...shape, text }]);
      setSelectedId(shape.id);
      return;
    }
    const kind: ShapeKind = currentTool === "pen" ? "path" : currentTool;
    setDraft(createDrawingShape(kind, point, color(), width()));
    canvas?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    const point = pointFromEvent(event);
    const activeDrag = drag();
    if (activeDrag) {
      const dx = point.x - activeDrag.start.x;
      const dy = point.y - activeDrag.start.y;
      setShapes((previous) =>
        previous.map((shape) =>
          shape.id === activeDrag.id
            ? {
                ...shape,
                x1: activeDrag.original.x1 + dx,
                y1: activeDrag.original.y1 + dy,
                x2: activeDrag.original.x2 + dx,
                y2: activeDrag.original.y2 + dy,
                points: activeDrag.original.points.map((item) => ({ x: item.x + dx, y: item.y + dy })),
              }
            : shape,
        ),
      );
      return;
    }
    const activeDraft = draft();
    if (!activeDraft) return;
    setDraft({
      ...activeDraft,
      x2: point.x,
      y2: point.y,
      points: activeDraft.kind === "path" ? [...activeDraft.points, point] : activeDraft.points,
    });
  }

  function onPointerUp(event: PointerEvent): void {
    if (drag()) {
      setDrag(null);
      return;
    }
    const activeDraft = draft();
    if (!activeDraft) return;
    canvas?.releasePointerCapture(event.pointerId);
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

  function undo(): void {
    const history = undoStack();
    const previous = history[history.length - 1];
    if (!previous) return;
    setRedoStack((redo) => [...redo, shapes()]);
    setUndoStack(history.slice(0, -1));
    setShapes(previous);
    setSelectedId(null);
  }

  function redo(): void {
    const history = redoStack();
    const next = history[history.length - 1];
    if (!next) return;
    setUndoStack((undoHistory) => [...undoHistory, shapes()]);
    setRedoStack(history.slice(0, -1));
    setShapes(next);
    setSelectedId(null);
  }

  async function save(): Promise<void> {
    if (saving()) return;
    setSaving(true);
    try {
      await props.onSave(serializeDrawing(shapes()));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      ref={(element) => (block = element)}
      class={styles.block}
      aria-label="Editor de pizarra"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
          event.preventDefault();
          event.shiftKey ? redo() : undo();
        }
        if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
        if (event.key === "Escape" && !saving()) props.onCancel();
      }}
    >
      <div class={styles.toolbar} role="toolbar" aria-label="Herramientas de pizarra">
        <For each={DRAWING_TOOLS}>
          {(item) => (
            <button
              type="button"
              class={tool() === item.id ? styles.active : undefined}
              aria-label={item.label}
              aria-pressed={tool() === item.id}
              title={item.label}
              onClick={() => setTool(item.id)}
            >
              <ToolIcon tool={item.id} />
            </button>
          )}
        </For>
        <label class={styles.color}>
          <span>Color</span>
          <input type="color" value={color()} onInput={(event) => setColor(event.currentTarget.value)} />
        </label>
        <label class={styles.widthControl}>
          <span>Grosor</span>
          <input
            type="range"
            min="1"
            max="16"
            value={width()}
            onInput={(event) => setWidth(Number(event.currentTarget.value))}
          />
        </label>
        <span class={styles.spacer} />
        <button type="button" disabled={undoStack().length === 0} onClick={undo}>Deshacer</button>
        <button type="button" disabled={redoStack().length === 0} onClick={redo}>Rehacer</button>
        <button
          type="button"
          class={styles.deleteButton}
          disabled={!selectedId()}
          onClick={deleteSelected}
          aria-label="Eliminar figura"
        >
          <TrashIcon />
        </button>
        <Button onClick={props.onCancel} disabled={saving()}>Cancelar</Button>
        <Button variant="primary" disabled={saving() || props.busy} onClick={() => void save()}>
          {saving() || props.busy ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      <div class={styles.canvasWrap}>
        <svg
          ref={(element) => (canvas = element)}
          class={styles.canvas}
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          role="img"
          aria-label="Lienzo de la pizarra"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <marker id={markerId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={color()} />
            </marker>
          </defs>
          <For each={shapes()}>
            {(shape) => (
              <>
                {shape.kind === "rect" && <rect x={shape.x1} y={shape.y1} width={shape.x2 - shape.x1} height={shape.y2 - shape.y1} fill="none" stroke={shape.color} stroke-width={shape.width} />}
                {shape.kind === "ellipse" && <ellipse cx={(shape.x1 + shape.x2) / 2} cy={(shape.y1 + shape.y2) / 2} rx={Math.abs(shape.x2 - shape.x1) / 2} ry={Math.abs(shape.y2 - shape.y1) / 2} fill="none" stroke={shape.color} stroke-width={shape.width} />}
                {shape.kind === "line" && <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={shape.color} stroke-width={shape.width} stroke-linecap="round" />}
                {shape.kind === "arrow" && <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={shape.color} stroke-width={shape.width} stroke-linecap="round" marker-end={`url(#${markerId})`} />}
                {shape.kind === "path" && <polyline points={shape.points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={shape.color} stroke-width={shape.width} stroke-linecap="round" stroke-linejoin="round" />}
                {shape.kind === "text" && <text x={shape.x1} y={shape.y1} fill={shape.color} font-family="sans-serif" font-size="24">{shape.text}</text>}
              </>
            )}
          </For>
          <Show when={draft()}>
            {(shape) => (
              <>
                {shape().kind === "rect" && <rect x={shape().x1} y={shape().y1} width={shape().x2 - shape().x1} height={shape().y2 - shape().y1} fill="none" stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
                {shape().kind === "ellipse" && <ellipse cx={(shape().x1 + shape().x2) / 2} cy={(shape().y1 + shape().y2) / 2} rx={Math.abs(shape().x2 - shape().x1) / 2} ry={Math.abs(shape().y2 - shape().y1) / 2} fill="none" stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
                {shape().kind === "line" && <line x1={shape().x1} y1={shape().y1} x2={shape().x2} y2={shape().y2} stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
                {shape().kind === "arrow" && <line x1={shape().x1} y1={shape().y1} x2={shape().x2} y2={shape().y2} stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" marker-end={`url(#${markerId})`} />}
                {shape().kind === "path" && <polyline points={shape().points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
              </>
            )}
          </Show>
          <For each={shapes().filter((shape) => shape.id === selectedId())}>
            {(shape) => {
              const box = drawingShapeBounds(shape);
              return <rect x={box.x - 8} y={box.y - 8} width={box.width + 16} height={box.height + 16} fill="none" stroke={color()} stroke-width="2" stroke-dasharray="6 5" pointer-events="none" />;
            }}
          </For>
        </svg>
      </div>
    </section>
  );
}
