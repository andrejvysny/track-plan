import type { BasePlaneBoard, CanvasLineShape } from '../types/layout';
import type { CanvasDimensionShape } from '../types/layout';
import type { ConnectorKey, TrackConnector, Vec2 } from '../types/trackSystem';
import type { ComponentGeometry } from '../types/trackSystem';

export type ConnectorEntry = {
  key: ConnectorKey;
  local: TrackConnector;
};

export const listConnectorEntries = (geometry: ComponentGeometry): ConnectorEntry[] => {
  const entries: ConnectorEntry[] = [
    { key: 'start', local: geometry.start },
    { key: 'end', local: geometry.end },
  ];
  if (geometry.extraConnectors) {
    Object.entries(geometry.extraConnectors).forEach(([key, connector]) => {
      entries.push({ key, local: connector });
    });
  }
  return entries;
};

export const computeLabelAnchor = (connectors: ConnectorEntry[]) => {
  if (!connectors.length) {
    return { xMm: 0, yMm: 0 };
  }
  const totals = connectors.reduce(
    (acc, entry) => {
      acc.x += entry.local.xMm;
      acc.y += entry.local.yMm;
      return acc;
    },
    { x: 0, y: 0 }
  );
  return {
    xMm: totals.x / connectors.length,
    yMm: totals.y / connectors.length,
  };
};

export const getDimensionGeometry = (shape: CanvasDimensionShape) => {
  const angleRad = (shape.rotationDeg / 180) * Math.PI;
  const dir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const normal = { x: -dir.y, y: dir.x };
  const half = shape.length / 2;
  const start = { x: shape.x - dir.x * half, y: shape.y - dir.y * half };
  const end = { x: shape.x + dir.x * half, y: shape.y + dir.y * half };
  const offsetStart = {
    x: start.x + normal.x * shape.offsetMm,
    y: start.y + normal.y * shape.offsetMm,
  };
  const offsetEnd = {
    x: end.x + normal.x * shape.offsetMm,
    y: end.y + normal.y * shape.offsetMm,
  };
  return { start, end, offsetStart, offsetEnd, dir, normal };
};

export const formatDimensionLabel = (shape: CanvasDimensionShape) =>
  shape.label ?? `${shape.length.toFixed(1)} mm`;

export const isDimensionShape = (shape: { type: string }): shape is CanvasDimensionShape =>
  shape.type === 'dimension';

export const estimateTextWidth = (text: string, fontSize: number, charWidthFactor: number) => {
  const length = Math.max(text.length, 1);
  return length * fontSize * charWidthFactor;
};

// --- Sketch / base-plane geometry helpers ---------------------------------

const rotate2d = (x: number, y: number, deg: number): Vec2 => {
  const rad = (deg / 180) * Math.PI;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
};

/** Closest point on the segment a→b to p, plus the distance and parameter t∈[0,1]. */
export const projectPointToSegment = (p: Vec2, a: Vec2, b: Vec2) => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  return { point, distance: Math.hypot(point.x - p.x, point.y - p.y), t };
};

export const lineEndpoints = (line: CanvasLineShape): [Vec2, Vec2] => [
  { x: line.x1, y: line.y1 },
  { x: line.x2, y: line.y2 },
];

export const lineLength = (line: CanvasLineShape) =>
  Math.hypot(line.x2 - line.x1, line.y2 - line.y1);

export const lineMidpoint = (line: CanvasLineShape): Vec2 => ({
  x: (line.x1 + line.x2) / 2,
  y: (line.y1 + line.y2) / 2,
});

export const lineAngleDeg = (line: CanvasLineShape) =>
  (Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180) / Math.PI;

export const formatLengthLabel = (mm: number, label?: string) => label ?? `${mm.toFixed(1)} mm`;

/** Outline vertices of a board in world mm (rect corners rotated, or polygon points). */
export const boardVertices = (board: BasePlaneBoard): Vec2[] => {
  if (board.kind === 'polygon') return board.points;
  const hw = board.width / 2;
  const hh = board.height / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((corner) => {
    const r = rotate2d(corner.x, corner.y, board.rotationDeg);
    return { x: r.x + board.x, y: r.y + board.y };
  });
};

/** Edges of a board as [from, to] pairs (closed loop). */
export const boardEdges = (board: BasePlaneBoard): [Vec2, Vec2][] => {
  const verts = boardVertices(board);
  return verts.map((v, i) => [v, verts[(i + 1) % verts.length]] as [Vec2, Vec2]);
};

/** Ray-cast point-in-polygon test (mm). */
export const pointInPolygon = (p: Vec2, pts: Vec2[]): boolean => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

export const pointInBoard = (p: Vec2, board: BasePlaneBoard): boolean =>
  pointInPolygon(p, boardVertices(board));

export const pointInBoards = (p: Vec2, boards: BasePlaneBoard[]): boolean =>
  boards.some((board) => pointInBoard(p, board));

export interface Bounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Axis-aligned mm bounds covering every board (null when there are none). */
export const basePlaneBounds = (boards: BasePlaneBoard[]): Bounds2D | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const board of boards) {
    for (const v of boardVertices(board)) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
};

/** SVG path "d" for a board outline (closed). */
export const boardPathD = (board: BasePlaneBoard): string => {
  const verts = boardVertices(board);
  if (verts.length === 0) return '';
  const [first, ...rest] = verts;
  return `M ${first.x} ${first.y} ${rest.map((v) => `L ${v.x} ${v.y}`).join(' ')} Z`;
};
