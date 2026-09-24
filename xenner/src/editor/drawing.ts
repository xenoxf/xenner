import type {
  DrawingShape,
  Point,
  ShapeBounds,
  ShapeKind,
} from "../types/drawing";

export const CANVAS_WIDTH = 1_000;
export const CANVAS_HEIGHT = 600;
export const DEFAULT_DRAWING_COLOR = "#6750a4";

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

export function drawingShapeBounds(shape: DrawingShape): ShapeBounds {
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

export function drawingShapeHits(shape: DrawingShape, point: Point): boolean {
  if (shape.kind === "path") {
    const box = drawingShapeBounds(shape);
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
  const box = drawingShapeBounds(shape);
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

function shapeToSvg(shape: DrawingShape): string {
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

export function drawingFromDataUrl(dataUrl: string): string {
  const base64 = dataUrl.split(",", 2)[1];
  if (!base64) return "";
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function drawingToDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

export function serializeDrawing(shapes: DrawingShape[]): string {
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

function numberAttribute(element: Element, name: string, fallback = 0): number {
  const value = Number.parseFloat(element.getAttribute(name) ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function bounded(value: number, maximum = CANVAS_WIDTH): number {
  return Math.max(0, Math.min(maximum, value));
}

function safeColor(value: string | null, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function parsePoints(value: string | null): Point[] {
  if (!value) return [];
  return value
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map((part) => Number.parseFloat(part)))
    .filter((pair): pair is [number, number] =>
      pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]),
    )
    .map(([x, y]) => ({ x: bounded(x), y: bounded(y, CANVAS_HEIGHT) }));
}

export function parseDrawingSvg(svg: string): DrawingShape[] {
  if (!svg || typeof DOMParser === "undefined") return [];
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return [];
  const root = parsed.documentElement;
  if (
    root.tagName.toLowerCase() !== "svg" ||
    root.getAttribute("data-xenner-asset")?.toLowerCase() !== "safe"
  ) {
    return [];
  }

  const shapes: DrawingShape[] = [];
  root.querySelectorAll("rect, ellipse, line, polyline, text").forEach((element) => {
    const tag = element.tagName.toLowerCase();
    const stroke = safeColor(element.getAttribute("stroke"), DEFAULT_DRAWING_COLOR);
    const width = Math.max(1, Math.min(16, numberAttribute(element, "stroke-width", 4)));
    const base: Omit<DrawingShape, "kind" | "x1" | "y1" | "x2" | "y2" | "points" | "text"> = {
      id: nextId(),
      color: stroke,
      width,
    };
    let shape: DrawingShape | null = null;

    if (tag === "rect") {
      const x = bounded(numberAttribute(element, "x"));
      const y = bounded(numberAttribute(element, "y"), CANVAS_HEIGHT);
      const rectWidth = Math.max(2, Math.abs(numberAttribute(element, "width", 2)));
      const rectHeight = Math.max(2, Math.abs(numberAttribute(element, "height", 2)));
      shape = {
        ...base,
        kind: "rect",
        x1: x,
        y1: y,
        x2: bounded(x + rectWidth),
        y2: bounded(y + rectHeight, CANVAS_HEIGHT),
        points: [],
        text: "",
      };
    } else if (tag === "ellipse") {
      const cx = bounded(numberAttribute(element, "cx"));
      const cy = bounded(numberAttribute(element, "cy"), CANVAS_HEIGHT);
      const rx = Math.max(1, Math.abs(numberAttribute(element, "rx", 1)));
      const ry = Math.max(1, Math.abs(numberAttribute(element, "ry", 1)));
      shape = {
        ...base,
        kind: "ellipse",
        x1: bounded(cx - rx),
        y1: bounded(cy - ry, CANVAS_HEIGHT),
        x2: bounded(cx + rx),
        y2: bounded(cy + ry, CANVAS_HEIGHT),
        points: [],
        text: "",
      };
    } else if (tag === "line") {
      const isArrow = element.getAttribute("marker-end")?.includes("arrowhead") ?? false;
      shape = {
        ...base,
        kind: isArrow ? "arrow" : "line",
        x1: bounded(numberAttribute(element, "x1")),
        y1: bounded(numberAttribute(element, "y1"), CANVAS_HEIGHT),
        x2: bounded(numberAttribute(element, "x2")),
        y2: bounded(numberAttribute(element, "y2"), CANVAS_HEIGHT),
        points: [],
        text: "",
      };
    } else if (tag === "polyline") {
      const points = parsePoints(element.getAttribute("points"));
      if (points.length >= 2) {
        shape = {
          ...base,
          kind: "path",
          x1: points[0].x,
          y1: points[0].y,
          x2: points[points.length - 1].x,
          y2: points[points.length - 1].y,
          points,
          text: "",
        };
      }
    } else if (tag === "text") {
      const text = element.textContent?.trim() ?? "";
      if (text) {
        shape = {
          ...base,
          kind: "text",
          x1: bounded(numberAttribute(element, "x")),
          y1: bounded(numberAttribute(element, "y"), CANVAS_HEIGHT),
          x2: bounded(numberAttribute(element, "x")),
          y2: bounded(numberAttribute(element, "y"), CANVAS_HEIGHT),
          points: [],
          text,
        };
      }
    }
    if (shape) shapes.push(shape);
  });
  return shapes;
}

export function createDrawingShape(
  kind: ShapeKind,
  point: Point,
  color: string,
  width: number,
): DrawingShape {
  return {
    id: nextId(),
    kind,
    x1: point.x,
    y1: point.y,
    x2: point.x,
    y2: point.y,
    points: [point],
    text: "",
    color,
    width,
  };
}
