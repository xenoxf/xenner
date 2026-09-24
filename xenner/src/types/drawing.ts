export type DrawingTool = "select" | "pen" | "rect" | "ellipse" | "line" | "arrow" | "text";
export type ShapeKind = Exclude<DrawingTool, "select"> | "path";

export interface Point {
  x: number;
  y: number;
}

export interface DrawingShape {
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

export interface ShapeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
