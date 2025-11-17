import type { LayoutState } from '../types/layout'

export function cloneLayoutState(layout: LayoutState): LayoutState {
  if (typeof structuredClone === 'function') {
    return structuredClone(layout)
  }

  return JSON.parse(JSON.stringify(layout))
}
