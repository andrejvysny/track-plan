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

export type ShapeType = 'rectangle' | 'circle' | 'text'

export type CanvasPrimitiveShape = {
  /** Unique instance identifier (e.g. uuid) */
  id: string
  /** Type of primitive shape: rectangle or circle */
  type: 'rectangle' | 'circle'
  /** Center X coordinate in mm */
  x: number
  /** Center Y coordinate in mm */
  y: number
  /** Width in mm (for rectangle) or diameter in mm (for circle) */
  width: number
  /** Height in mm (for rectangle only) */
  height?: number
  /** Rotation in degrees */
  rotationDeg: number
}

export type CanvasTextShape = {
  id: string
  type: 'text'
  x: number
  y: number
  /** The text content to render */
  text: string
  /** Font size in mm */
  fontSize: number
  /** Width of the text area in mm */
  width: number
  /** Height of the text area in mm */
  height: number
  rotationDeg: number
}

export type CanvasShape = CanvasPrimitiveShape | CanvasTextShape

/** LayoutState is intentionally generic right now; future phases will extend it with connectors, grid settings, etc. */
