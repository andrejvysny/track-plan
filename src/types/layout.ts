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
}

export interface EndpointConnection {
  endpoints: [EndpointRef, EndpointRef]
}

/** LayoutState is intentionally generic right now; future phases will extend it with connectors, grid settings, etc. */
