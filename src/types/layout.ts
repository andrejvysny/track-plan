import type { EndpointRef, TrackSystemDefinition, Vec2 } from './trackSystem';

export interface PlacedItem {
  /** Unique instance identifier (e.g. uuid) */
  id: string;
  trackSystemId: string;
  componentId: string;
  x: number;
  y: number;
  rotationDeg: number;
  isGrounded?: boolean;
  connectorElevationsMm?: Record<string, number>;
}

export interface LayoutState {
  /** Tracks which system the UI should render as active */
  activeTrackSystemId: string | null;
  /** Pool of available track systems */
  trackSystems: TrackSystemDefinition[];
  /** Instances placed on the canvas */
  placedItems: PlacedItem[];
  /** Tracks currently connected endpoints */
  connections: EndpointConnection[];
  /** Simple shapes drawn on the canvas */
  shapes: CanvasShape[];
  /** User-drawn baseboard/benchwork that tracks are placed onto (drives the 3D baseboard) */
  basePlane?: BasePlane;
}

/** A single benchwork board: a rectangle or an arbitrary closed polygon (mm). */
export type BasePlaneBoard =
  | {
      id: string;
      kind: 'rect';
      /** Center X/Y in mm */
      x: number;
      y: number;
      width: number;
      height: number;
      rotationDeg: number;
    }
  | {
      id: string;
      kind: 'polygon';
      /** Closed-loop vertices in mm (order matters; last connects back to first) */
      points: Vec2[];
    };

/** The base plane: a set of boards forming the table the layout sits on. */
export interface BasePlane {
  boards: BasePlaneBoard[];
  /** Board thickness in mm (for the 3D slab); defaults applied at render time. */
  thicknessMm?: number;
}

export interface EndpointConnection {
  endpoints: [EndpointRef, EndpointRef];
}

export type ShapeType = 'rectangle' | 'circle' | 'text' | 'dimension' | 'line';

/** Active drawing tool: a sketch shape, or a base-plane board tool. */
export type DrawingTool = ShapeType | 'basePlaneRect' | 'basePlanePolygon';

export type CanvasPrimitiveShape = {
  /** Unique instance identifier (e.g. uuid) */
  id: string;
  /** Type of primitive shape: rectangle or circle */
  type: 'rectangle' | 'circle';
  /** Center X coordinate in mm */
  x: number;
  /** Center Y coordinate in mm */
  y: number;
  /** Width in mm (for rectangle) or diameter in mm (for circle) */
  width: number;
  /** Height in mm (for rectangle only) */
  height?: number;
  /** Rotation in degrees */
  rotationDeg: number;
};

export type CanvasTextShape = {
  id: string;
  type: 'text';
  x: number;
  y: number;
  /** The text content to render */
  text: string;
  /** Font size in mm */
  fontSize: number;
  /** Width of the text area in mm */
  width: number;
  /** Height of the text area in mm */
  height: number;
  rotationDeg: number;
};

export type CanvasDimensionShape = {
  id: string;
  type: 'dimension';
  /** Center of the measured span */
  x: number;
  y: number;
  /** Length of the measured span in mm */
  length: number;
  /** Dimension line rotation (aligned with the measured span) */
  rotationDeg: number;
  /** Perpendicular offset of the dimension line from the measured points */
  offsetMm: number;
  /** Optional custom label; when absent, the length is shown */
  label?: string;
};

export type CanvasLineShape = {
  id: string;
  type: 'line';
  /** Endpoints in mm */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Optional custom label; when absent, the length is shown */
  label?: string;
};

export type CanvasShape =
  | CanvasPrimitiveShape
  | CanvasTextShape
  | CanvasDimensionShape
  | CanvasLineShape;

/** LayoutState is intentionally generic right now; future phases will extend it with connectors, grid settings, etc. */
