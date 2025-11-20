import type { TrackComponentType } from '../types/trackSystem'

export const TRACK_COMPONENT_TYPES: TrackComponentType[] = ['straight', 'curve', 'switch', 'other']

export const TRACK_COMPONENT_TYPE_LABELS: Record<TrackComponentType, string> = {
  straight: 'Straight',
  curve: 'Curve',
  switch: 'Switch',
  other: 'Other',
}
