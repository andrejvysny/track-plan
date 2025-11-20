import type { TrackComponentType } from './trackSystem'

export interface TrackUsageComponentCount {
  componentId: string
  label: string
  type: TrackComponentType
  article?: string
  count: number
}

export interface TrackUsageSummary {
  totalCount: number
  countsByType: Record<TrackComponentType, number>
  componentCounts: TrackUsageComponentCount[]
}
