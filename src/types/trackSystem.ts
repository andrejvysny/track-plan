export type TrackComponentType = 'straight' | 'curve' | 'switch' | 'other'

export interface TrackComponentDefinition {
  id: string
  label: string
  type: TrackComponentType
  lengthMm?: number
  radiusMm?: number
  angleDeg?: number
  clockwise?: boolean
  article?: string
  meta?: Record<string, unknown>
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
