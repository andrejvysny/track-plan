import type { LayoutState } from '../types/layout'
import { pikoA_H0 } from '../data/pikoA_H0'

/**
 * Creates a fresh LayoutState with the demo track system preloaded.
 * This is intentionally minimal; future phases will extend the shape with connectors, grid metadata, etc.
 */
export function createDefaultLayoutState(): LayoutState {
  return {
    activeTrackSystemId: pikoA_H0.id,
    trackSystems: [pikoA_H0],
    placedItems: [],
  }
}

// TODO: Support multiple selectable track systems per layout once the UI can switch between them.
