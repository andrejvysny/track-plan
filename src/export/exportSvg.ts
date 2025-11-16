import type { LayoutState } from '../types/layout'
import type { TrackSystemDefinition, TrackComponentDefinition } from '../types/trackSystem'
import { getComponentGeometry, rotatePointLocal } from '../geometry/trackGeometry'

const TRACK_STROKE_WIDTH_MM = 28

type Bounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const expandBounds = (bounds: Bounds, padding: number): Bounds => ({
  minX: bounds.minX - padding,
  maxX: bounds.maxX + padding,
  minY: bounds.minY - padding,
  maxY: bounds.maxY + padding,
})

const getLocalBounds = (component: TrackComponentDefinition, trackWidth: number): Bounds => {
  if (component.type === 'straight' && component.lengthMm) {
    const half = component.lengthMm / 2
    return { minX: -half, maxX: half, minY: -trackWidth, maxY: trackWidth }
  }

  if ((component.type === 'curve' || component.type === 'switch') && component.radiusMm) {
    const r = component.radiusMm
    return { minX: -r, maxX: r, minY: -r, maxY: r }
  }

  return { minX: -50, maxX: 50, minY: -10, maxY: 10 }
}

const transformBounds = (bounds: Bounds, x: number, y: number, rotationDeg: number): Bounds => {
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ]

  const transformed = corners.map((corner) => {
    const rotated = rotatePointLocal(corner.x, corner.y, rotationDeg)
    return { x: rotated.x + x, y: rotated.y + y }
  })

  return transformed.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
  )
}

const mergeBounds = (a: Bounds | null, b: Bounds) => {
  if (!a) return b
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

export function buildLayoutSvgString(
  layout: LayoutState,
  trackSystem: TrackSystemDefinition,
  options?: { paddingMm?: number },
) {
  const padding = options?.paddingMm ?? 50
  const trackWidth = TRACK_STROKE_WIDTH_MM
  const componentMap = new Map<string, TrackComponentDefinition>()
  trackSystem.components.forEach((component) => componentMap.set(component.id, component))

  const pathSegments: string[] = []
  let bounds: Bounds | null = null

  layout.placedItems.forEach((item) => {
    const component = componentMap.get(item.componentId)
    if (!component) return
    const geometry = getComponentGeometry(component)
    const localBounds = getLocalBounds(component, trackWidth)
    const worldBounds = transformBounds(localBounds, item.x, item.y, item.rotationDeg)
    bounds = mergeBounds(bounds, worldBounds)

    const path = geometry.buildPathD()
    pathSegments.push(
      `<g transform="translate(${item.x} ${item.y}) rotate(${item.rotationDeg})"><path d="${path}" fill="none" stroke="#111827" stroke-width="${trackWidth}" stroke-linecap="round" stroke-linejoin="round"/><text x="0" y="-10" text-anchor="middle" font-size="10" fill="#1f2937">${component.id}</text></g>`,
    )
  })

  if (!bounds) {
    const emptyView = expandBounds({ minX: -100, maxX: 100, minY: -100, maxY: 100 }, padding)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${emptyView.minX} ${emptyView.minY} ${emptyView.maxX - emptyView.minX} ${emptyView.maxY - emptyView.minY}"></svg>`
  }

  const padded = expandBounds(bounds, padding)
  const width = padded.maxX - padded.minX
  const height = padded.maxY - padded.minY

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${padded.minX} ${padded.minY} ${width} ${height}" fill="none">${pathSegments.join('\n')}</svg>`
}
