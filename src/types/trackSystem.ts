export type TrackComponentType = 'straight' | 'curve' | 'switch' | 'crossing' | 'other'

export interface Vec2 {
  x: number
  y: number
}

export interface TrackComponentDefinition {
  id: string
  label: string
  type: TrackComponentType
  lengthMm?: number
  radiusMm?: number
  angleDeg?: number
  clockwise?: boolean
  article?: string
  color?: string
  meta?: Record<string, unknown>
}

export interface CrossingMeta {
  lengthMm: number
  crossingAngleDeg: number
}

export interface TrackSystemDefinition {
  id: string
  name: string
  scale: string
  ratio: number
  gaugeMm: number
  parallelSpacingMm: number
  moduleLengthMm: number
  components: TrackComponentDefinition[]
}

export interface TrackConnector {
  xMm: number
  yMm: number
  /** Unit tangent pointing outwards from the track at this endpoint */
  dir: Vec2
  /** Width of the short edge centered on this endpoint (fixed 28 mm for PIKO A) */
  widthMm: number
  /** Kept for backwards compatibility with existing logic/UI */
  directionDeg: number
}

export interface ComponentGeometry {
  start: TrackConnector
  end: TrackConnector
  buildPathD(): string
  extraConnectors?: Record<string, TrackConnector>
}

export interface WorldTransform {
  x: number
  y: number
  rotationDeg: number
}

export type ConnectorKey = 'start' | 'end' | string

export interface EndpointRef {
  itemId: string
  connectorKey: ConnectorKey
}
