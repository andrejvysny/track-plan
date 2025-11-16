import type { TrackSystemDefinition } from './trackSystem'

export interface PlacedItem {
  /** Unique instance identifier (e.g. uuid) */
  id: string
  trackSystemId: string
  componentId: string
  x: number
  y: number
  rotationDeg: number
}

export interface LayoutState {
  /** Tracks which system the UI should render as active */
  activeTrackSystemId: string | null
  /** Pool of available track systems */
  trackSystems: TrackSystemDefinition[]
  /** Instances placed on the canvas */
  placedItems: PlacedItem[]
}

/** LayoutState is intentionally generic right now; future phases will extend it with connectors, grid settings, etc. */
