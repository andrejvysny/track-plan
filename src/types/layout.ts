import type { EndpointRef, TrackSystemDefinition } from './trackSystem'

export interface PlacedItem {
  /** Unique instance identifier (e.g. uuid) */
  id: string
  trackSystemId: string
  componentId: string
  x: number
  y: number
  rotationDeg: number
  isGrounded?: boolean
}

export interface LayoutState {
  /** Tracks which system the UI should render as active */
  activeTrackSystemId: string | null
  /** Pool of available track systems */
  trackSystems: TrackSystemDefinition[]
  /** Instances placed on the canvas */
  placedItems: PlacedItem[]
  /** Tracks currently connected endpoints */
  connections: EndpointConnection[]
  /** Simple shapes drawn on the canvas */
  shapes: CanvasShape[]
}

export interface EndpointConnection {
  endpoints: [EndpointRef, EndpointRef]
}

export type ShapeType = 'rectangle' | 'square' | 'circle'

export interface CanvasShape {
  /** Unique instance identifier (e.g. uuid) */
  id: string
  /** Type of shape */
  type: ShapeType
  /** Center X coordinate in mm */
  x: number
  /** Center Y coordinate in mm */
  y: number
  /** Width in mm (for rectangle/square) or radius in mm (for circle) */
  width: number
  /** Height in mm (for rectangle only, ignored for square/circle) */
  height?: number
  /** Rotation in degrees */
  rotationDeg: number
}

/** LayoutState is intentionally generic right now; future phases will extend it with connectors, grid settings, etc. */
