import type { Point, Rect } from "./content/maps";

export type Ellipse = {
  x: number;
  y: number;
  rx: number;
  ry: number;
};

export type Polygon = {
  points: Point[];
};

export type Segment = {
  from: Point;
  to: Point;
  width: number;
};

export type CollisionShapes = {
  rects?: Rect[];
  ellipses?: Ellipse[];
  polygons?: Polygon[];
  segments?: Segment[];
};

export class CollisionGrid {
  readonly cols: number;
  readonly rows: number;
  private grid: Uint8Array;

  constructor(
    readonly worldWidth: number,
    readonly worldHeight: number,
    readonly cellSize: number,
  ) {
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    this.grid = new Uint8Array(this.cols * this.rows);
  }

  addShapes(shapes: CollisionShapes) {
    shapes.rects?.forEach((r) => this.rasterizeRect(r));
    shapes.ellipses?.forEach((e) => this.rasterizeEllipse(e));
    shapes.polygons?.forEach((p) => this.rasterizePolygon(p));
    shapes.segments?.forEach((s) => this.rasterizeSegment(s));
  }

  addMaskImage(source: CanvasImageSource) {
    const canvas = document.createElement("canvas");
    canvas.width = this.worldWidth;
    canvas.height = this.worldHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(source, 0, 0, this.worldWidth, this.worldHeight);
    const pixels = ctx.getImageData(0, 0, this.worldWidth, this.worldHeight).data;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x = Math.min(this.worldWidth - 1, Math.floor(col * this.cellSize + this.cellSize / 2));
        const y = Math.min(this.worldHeight - 1, Math.floor(row * this.cellSize + this.cellSize / 2));
        const alpha = pixels[(y * this.worldWidth + x) * 4 + 3];
        if (alpha > 24) this.setCell(col, row);
      }
    }
  }

  isBlocked(x: number, y: number): boolean {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return true;
    return this.grid[row * this.cols + col] === 1;
  }

  private setCell(col: number, row: number) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    this.grid[row * this.cols + col] = 1;
  }

  private rasterizeRect(r: Rect) {
    const left = r.x - r.width / 2;
    const top = r.y - r.height / 2;
    const right = r.x + r.width / 2;
    const bottom = r.y + r.height / 2;
    const c0 = Math.floor(left / this.cellSize);
    const c1 = Math.floor(right / this.cellSize);
    const r0 = Math.floor(top / this.cellSize);
    const r1 = Math.floor(bottom / this.cellSize);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        this.setCell(col, row);
      }
    }
  }

  private rasterizeEllipse(e: Ellipse) {
    const c0 = Math.floor((e.x - e.rx) / this.cellSize);
    const c1 = Math.floor((e.x + e.rx) / this.cellSize);
    const r0 = Math.floor((e.y - e.ry) / this.cellSize);
    const r1 = Math.floor((e.y + e.ry) / this.cellSize);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const cx = col * this.cellSize + this.cellSize / 2;
        const cy = row * this.cellSize + this.cellSize / 2;
        const dx = (cx - e.x) / e.rx;
        const dy = (cy - e.y) / e.ry;
        if (dx * dx + dy * dy <= 1) this.setCell(col, row);
      }
    }
  }

  private rasterizePolygon(p: Polygon) {
    if (p.points.length < 3) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of p.points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    const c0 = Math.floor(minX / this.cellSize);
    const c1 = Math.floor(maxX / this.cellSize);
    const r0 = Math.floor(minY / this.cellSize);
    const r1 = Math.floor(maxY / this.cellSize);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const cx = col * this.cellSize + this.cellSize / 2;
        const cy = row * this.cellSize + this.cellSize / 2;
        if (pointInPolygon(cx, cy, p.points)) this.setCell(col, row);
      }
    }
  }

  private rasterizeSegment(s: Segment) {
    const radius = s.width / 2;
    const minX = Math.min(s.from.x, s.to.x) - radius;
    const maxX = Math.max(s.from.x, s.to.x) + radius;
    const minY = Math.min(s.from.y, s.to.y) - radius;
    const maxY = Math.max(s.from.y, s.to.y) + radius;
    const c0 = Math.floor(minX / this.cellSize);
    const c1 = Math.floor(maxX / this.cellSize);
    const r0 = Math.floor(minY / this.cellSize);
    const r1 = Math.floor(maxY / this.cellSize);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const cx = col * this.cellSize + this.cellSize / 2;
        const cy = row * this.cellSize + this.cellSize / 2;
        if (distanceToSegment(cx, cy, s.from, s.to) <= radius) this.setCell(col, row);
      }
    }
  }

  renderDebugCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.worldWidth;
    canvas.height = this.worldHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(225, 64, 72, 0.42)";
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (this.grid[row * this.cols + col] === 1) {
          ctx.fillRect(
            col * this.cellSize,
            row * this.cellSize,
            this.cellSize,
            this.cellSize,
          );
        }
      }
    }
    return canvas;
  }
}

function distanceToSegment(x: number, y: number, from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(x - from.x, y - from.y);
  const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / lengthSq));
  const closestX = from.x + t * dx;
  const closestY = from.y + t * dy;
  return Math.hypot(x - closestX, y - closestY);
}

function pointInPolygon(x: number, y: number, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
