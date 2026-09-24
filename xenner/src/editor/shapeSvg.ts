import type { ShapeColor, ShapeTool } from "../types/editor";

export function createShapeSvg(tool: ShapeTool, color: ShapeColor): string {
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
  const marker = tool === "arrow"
    ? `<marker id="shape-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0 0 10 5 0 10Z" fill="${color}" /></marker>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 540" data-xenner-asset="safe"><defs>${marker}</defs>${body}</svg>`;
}
