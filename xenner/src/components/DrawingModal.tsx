import { createSignal, For, onMount, Show } from "solid-js";

import { CloseIcon, TrashIcon } from "./Icons";

type Tool = "select" | "pen" | "rect" | "ellipse" | "line" | "arrow" | "text";
type ShapeKind = Exclude<Tool, "select"> | "path";

interface Point {
  x: number;
  y: number;
}

interface Shape {
  id: string;
  kind: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points: Point[];
  text: string;
  color: string;
  width: number;
}

interface DrawingModalProps {
  onSave(svg: string): void | Promise<void>;
  onClose(): void;
}

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 600;
const DEFAULT_COLOR = "#6750a4";

let shapeId = 0;

function nextId(): string {
  shapeId += 1;
  return `shape-${shapeId}`;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function bounds(shape: Shape): { x: number; y: number; width: number; height: number } {
  if (shape.kind === "path") {
    const xs = shape.points.map((point) => point.x);
    const ys = shape.points.map((point) => point.y);
    const minX = Math.min(...xs, shape.x1, shape.x2);
    const minY = Math.min(...ys, shape.y1, shape.y2);
    return {
      x: minX,
      y: minY,
      width: Math.max(2, Math.max(...xs, shape.x1, shape.x2) - minX),
      height: Math.max(2, Math.max(...ys, shape.y1, shape.y2) - minY),
    };
  }
  return {
    x: Math.min(shape.x1, shape.x2),
    y: Math.min(shape.y1, shape.y2),
    width: Math.max(2, Math.abs(shape.x2 - shape.x1)),
    height: Math.max(2, Math.abs(shape.y2 - shape.y1)),
  };
}

function hits(shape: Shape, point: Point): boolean {
  if (shape.kind === "path") {
    const box = bounds(shape);
    return (
      point.x >= box.x - shape.width &&
      point.x <= box.x + box.width + shape.width &&
      point.y >= box.y - shape.width &&
      point.y <= box.y + box.height + shape.width
    );
  }
  if (shape.kind === "line" || shape.kind === "arrow") {
    return distanceToSegment(point, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }) <= shape.width + 8;
  }
  if (shape.kind === "text") {
    return point.x >= shape.x1 - 10 && point.x <= shape.x1 + 180 && point.y >= shape.y1 - 24 && point.y <= shape.y1 + 12;
  }
  const box = bounds(shape);
  const padding = shape.width + 6;
  return (
    point.x >= box.x - padding &&
    point.x <= box.x + box.width + padding &&
    point.y >= box.y - padding &&
    point.y <= box.y + box.height + padding
  );
}

function escapeXml(value: string): string {
  return value
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&apos;");
}

function shapeToSvg(shape: Shape): string {
  const common = `fill="none" stroke="${shape.color}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (shape.kind) {
    case "rect":
      return `<rect x="${shape.x1}" y="${shape.y1}" width="${shape.x2 - shape.x1}" height="${shape.y2 - shape.y1}" ${common} />`;
    case "ellipse":
      return `<ellipse cx="${(shape.x1 + shape.x2) / 2}" cy="${(shape.y1 + shape.y2) / 2}" rx="${Math.abs(shape.x2 - shape.x1) / 2}" ry="${Math.abs(shape.y2 - shape.y1) / 2}" ${common} />`;
    case "line":
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${common} />`;
    case "arrow":
      return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${common} marker-end="url(#arrowhead-${shape.id})" />`;
    case "path":
      return `<polyline points="${shape.points.map((point) => `${point.x},${point.y}`).join(" ")}" ${common} />`;
    case "text":
      return `<text x="${shape.x1}" y="${shape.y1}" fill="${shape.color}" font-family="sans-serif" font-size="24">${escapeXml(shape.text)}</text>`;
    default:
      return "";
  }
}

function svgDocument(shapes: Shape[]): string {
  const body = shapes.map(shapeToSvg).join("");
  const markers = shapes
    .filter((shape) => shape.kind === "arrow")
    .map(
      (shape) =>
        `<marker id="arrowhead-${shape.id}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${shape.color}" /></marker>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" data-xenner-asset="safe"><defs>${markers}</defs>${body}</svg>`;
}

export function DrawingModal(props: DrawingModalProps) {
  const [tool, setTool] = createSignal<Tool>("select");
  const [color, setColor] = createSignal(DEFAULT_COLOR);
  const [width, setWidth] = createSignal(4);
  const [shapes, setShapes] = createSignal<Shape[]>([]);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [draft, setDraft] = createSignal<Shape | null>(null);
  const [drag, setDrag] = createSignal<{ id: string; start: Point; original: Shape } | null>(null);
  const [undoStack, setUndoStack] = createSignal<Shape[][]>([]);
  const [redoStack, setRedoStack] = createSignal<Shape[][]>([]);
  let canvas: SVGSVGElement | undefined;
  let modal: HTMLDivElement | undefined;

  onMount(() => queueMicrotask(() => modal?.focus()));

  function pointFromEvent(event: PointerEvent): Point {
    const rect = canvas!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(CANVAS_WIDTH, ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH)),
      y: Math.max(0, Math.min(CANVAS_HEIGHT, ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT)),
    };
  }

  function commit(next: Shape[]): void {
    setUndoStack((previous) => [...previous, shapes()]);
    setRedoStack([]);
    setShapes(next);
  }

  function makeShape(kind: ShapeKind, point: Point): Shape {
    return {
      id: nextId(),
      kind,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      points: [point],
      text: "",
      color: color(),
      width: width(),
    };
  }

  function onPointerDown(event: PointerEvent): void {
    const point = pointFromEvent(event);
    const currentTool = tool();
    if (currentTool === "select") {
      const hit = [...shapes()].reverse().find((shape) => hits(shape, point));
      setSelectedId(hit?.id ?? null);
      if (hit) setDrag({ id: hit.id, start: point, original: { ...hit, points: [...hit.points] } });
      return;
    }
    if (currentTool === "text") {
      const text = window.prompt("Texto del dibujo", "Texto")?.trim();
      if (!text) return;
      const shape = makeShape("text", point);
      commit([...shapes(), { ...shape, text }]);
      setSelectedId(shape.id);
      return;
    }
    const kind: ShapeKind = currentTool === "pen" ? "path" : currentTool;
    setDraft(makeShape(kind, point));
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

  const tools: { id: Tool; label: string }[] = [
    { id: "select", label: "Seleccionar" },
    { id: "pen", label: "Trazo" },
    { id: "rect", label: "Rectángulo" },
    { id: "ellipse", label: "Elipse" },
    { id: "line", label: "Línea" },
    { id: "arrow", label: "Flecha" },
    { id: "text", label: "Texto" },
  ];

  return (
    <div class="modal-backdrop drawing-backdrop">
      <div
        ref={(element) => (modal = element)}
        class="drawing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawing-title"
        tabindex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onClose();
          if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            event.shiftKey ? redo() : undo();
          }
        }}
      >
        <header class="drawing-header">
          <div>
            <p>Objeto visual</p>
            <h2 id="drawing-title">Nuevo dibujo</h2>
          </div>
          <button type="button" class="icon-button" aria-label="Cerrar dibujo" onClick={props.onClose}>
            <CloseIcon />
          </button>
        </header>
        <div class="drawing-toolbar" role="toolbar" aria-label="Herramientas de dibujo">
          <For each={tools}>
            {(item) => (
              <button
                type="button"
                classList={{ active: tool() === item.id }}
                aria-pressed={tool() === item.id}
                onClick={() => setTool(item.id)}
              >
                {item.label}
              </button>
            )}
          </For>
          <label class="drawing-color">
            <span>Color</span>
            <input type="color" value={color()} onInput={(event) => setColor(event.currentTarget.value)} />
          </label>
          <label class="drawing-width">
            <span>Grosor</span>
            <input
              type="range"
              min="1"
              max="16"
              value={width()}
              onInput={(event) => setWidth(Number(event.currentTarget.value))}
            />
          </label>
          <span class="drawing-toolbar-spacer" />
          <button type="button" onClick={undo} disabled={undoStack().length === 0}>
            Deshacer
          </button>
          <button type="button" onClick={redo} disabled={redoStack().length === 0}>
            Rehacer
          </button>
          <button type="button" class="danger" onClick={deleteSelected} disabled={!selectedId()}>
            <TrashIcon /> Eliminar
          </button>
        </div>
        <div class="drawing-canvas-wrap">
          <svg
            ref={(element) => (canvas = element)}
            class="drawing-canvas"
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            role="img"
            aria-label="Lienzo del dibujo"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill={color()} />
              </marker>
            </defs>
            <For each={shapes()}>
              {(shape) => (
                <>
                  {shape.kind === "rect" && (
                    <rect x={shape.x1} y={shape.y1} width={shape.x2 - shape.x1} height={shape.y2 - shape.y1} fill="none" stroke={shape.color} stroke-width={shape.width} />
                  )}
                  {shape.kind === "ellipse" && (
                    <ellipse cx={(shape.x1 + shape.x2) / 2} cy={(shape.y1 + shape.y2) / 2} rx={Math.abs(shape.x2 - shape.x1) / 2} ry={Math.abs(shape.y2 - shape.y1) / 2} fill="none" stroke={shape.color} stroke-width={shape.width} />
                  )}
                  {shape.kind === "line" && <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={shape.color} stroke-width={shape.width} stroke-linecap="round" />}
                  {shape.kind === "arrow" && <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} stroke={shape.color} stroke-width={shape.width} stroke-linecap="round" marker-end="url(#arrowhead)" />}
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
                  {shape().kind === "arrow" && <line x1={shape().x1} y1={shape().y1} x2={shape().x2} y2={shape().y2} stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" marker-end="url(#arrowhead)" />}
                  {shape().kind === "path" && <polyline points={shape().points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={shape().color} stroke-width={shape().width} stroke-dasharray="8 6" />}
                </>
              )}
            </Show>
            <For each={shapes().filter((shape) => shape.id === selectedId())}>
              {(shape) => {
                const box = bounds(shape);
                return <rect x={box.x - 8} y={box.y - 8} width={box.width + 16} height={box.height + 16} fill="none" stroke={color()} stroke-width="2" stroke-dasharray="6 5" pointer-events="none" />;
              }}
            </For>
          </svg>
        </div>
        <footer class="drawing-footer">
          <span>Selecciona una herramienta y dibuja sobre el lienzo.</span>
          <div>
            <button type="button" class="button" onClick={props.onClose}>
              Cancelar
            </button>
            <button type="button" class="button primary" onClick={() => void props.onSave(svgDocument(shapes()))}>
              Insertar dibujo
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
