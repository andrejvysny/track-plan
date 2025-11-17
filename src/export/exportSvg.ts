import type { CanvasShape, CanvasTextShape, LayoutState } from '../types/layout'
import type {
  TrackComponentDefinition,
  TrackConnector,
  TrackSystemDefinition,
} from '../types/trackSystem'
import { getComponentGeometry, rotatePointLocal } from '../geometry/trackGeometry'
import { TEXT_DEFAULT_HEIGHT_MM, TEXT_DEFAULT_WIDTH_MM } from '../constants/layout'

const TRACK_STROKE_WIDTH_MM = 28
const EXPORT_BLACK = '#000'
const ENDPOINT_CIRCLE_RADIUS = 8
const LABEL_OFFSET_MM = 18
const SHAPE_STROKE_WIDTH = 2

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
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
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

type ConnectorEntry = {
  key: string
  local: TrackConnector
}

const listConnectorEntries = (geometry: ReturnType<typeof getComponentGeometry>): ConnectorEntry[] => {
  const entries: ConnectorEntry[] = [
    { key: 'start', local: geometry.start },
    { key: 'end', local: geometry.end },
  ]
  if (geometry.extraConnectors) {
    Object.entries(geometry.extraConnectors).forEach(([key, connector]) => {
      entries.push({ key, local: connector })
    })
  }
  return entries
}

const computeLabelAnchor = (connectors: ConnectorEntry[]) => {
  if (!connectors.length) {
    return { xMm: 0, yMm: 0 }
  }
  const totals = connectors.reduce(
    (acc, entry) => {
      acc.x += entry.local.xMm
      acc.y += entry.local.yMm
      return acc
    },
    { x: 0, y: 0 },
  )
  return {
    xMm: totals.x / connectors.length,
    yMm: totals.y / connectors.length,
  }
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const trackBoundsPadding = TRACK_STROKE_WIDTH_MM / 2 + ENDPOINT_CIRCLE_RADIUS

const getShapeBounds = (shape: CanvasShape): Bounds => {
  const shapeType = shape.type
  const halfWidth = shape.width / 2
  if (shapeType === 'circle') {
    const radius = halfWidth
    const bounds: Bounds = {
      minX: shape.x - radius,
      maxX: shape.x + radius,
      minY: shape.y - radius,
      maxY: shape.y + radius,
    }
    return expandBounds(bounds, SHAPE_STROKE_WIDTH / 2)
  }

  if (shapeType === 'text') {
    const textShape = shape as CanvasTextShape
    const textWidth = textShape.width ?? TEXT_DEFAULT_WIDTH_MM
    const textHeight = textShape.height ?? TEXT_DEFAULT_HEIGHT_MM
    const halfTextWidth = textWidth / 2
    const halfTextHeight = textHeight / 2
    const corners = [
      { x: -halfTextWidth, y: -halfTextHeight },
      { x: halfTextWidth, y: -halfTextHeight },
      { x: halfTextWidth, y: halfTextHeight },
      { x: -halfTextWidth, y: halfTextHeight },
    ]
    const rotated = corners.map((corner) => rotatePointLocal(corner.x, corner.y, shape.rotationDeg))
    const world = rotated.map((point) => ({ x: point.x + shape.x, y: point.y + shape.y }))
    const bounds = world.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y),
      }),
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    )
    return expandBounds(bounds, SHAPE_STROKE_WIDTH / 2)
  }

  const height = shape.height ?? shape.width
  const halfHeight = height / 2
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ]

  const rotated = corners.map((corner) => rotatePointLocal(corner.x, corner.y, shape.rotationDeg))
  const world = rotated.map((point) => ({ x: point.x + shape.x, y: point.y + shape.y }))
  const bounds = world.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minY: Math.min(acc.minY, point.y),
      maxY: Math.max(acc.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  )
  return expandBounds(bounds, SHAPE_STROKE_WIDTH / 2)
}

const buildShapeElement = (shape: CanvasShape) => {
  const rotationTransform = `rotate(${shape.rotationDeg} ${shape.x} ${shape.y})`
  const shapeType = shape.type

  if (shapeType === 'circle') {
    const radius = shape.width / 2
    return `<circle cx="${shape.x}" cy="${shape.y}" r="${radius}" fill="none" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" transform="${rotationTransform}"/>`
  }

  if (shapeType === 'text') {
    const textShape = shape as CanvasTextShape
    return `<text x="${textShape.x}" y="${textShape.y}" text-anchor="middle" dominant-baseline="middle" font-size="${textShape.fontSize}" fill="${EXPORT_BLACK}" transform="${rotationTransform}">${escapeXml(textShape.text)}</text>`
  }

  // Rectangle (includes legacy squares)
  const height = shape.height ?? shape.width
  const halfHeight = height / 2
  const x = shape.x - shape.width / 2
  const y = shape.y - halfHeight
  return `<rect x="${x}" y="${y}" width="${shape.width}" height="${height}" fill="none" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" transform="${rotationTransform}"/>`
}

export function buildLayoutSvgString(
  layout: LayoutState,
  trackSystem: TrackSystemDefinition,
  options?: { paddingMm?: number },
) {
  const padding = options?.paddingMm ?? 50
  const componentMap = new Map<string, TrackComponentDefinition>()
  trackSystem.components.forEach((component) => componentMap.set(component.id, component))

  const trackElements: string[] = []
  const shapeElements: string[] = []
  let bounds: Bounds | null = null

  layout.placedItems.forEach((item) => {
    const component = componentMap.get(item.componentId)
    if (!component) return
    const geometry = getComponentGeometry(component)

    const connectorEntries = listConnectorEntries(geometry)
    const labelAnchor = computeLabelAnchor(connectorEntries)
    const rotatedLabelAnchor = rotatePointLocal(labelAnchor.xMm, labelAnchor.yMm, item.rotationDeg)
    const labelOffsetPoint = rotatePointLocal(0, -LABEL_OFFSET_MM, item.rotationDeg)
    const labelX = item.x + rotatedLabelAnchor.x + labelOffsetPoint.x
    const labelY = item.y + rotatedLabelAnchor.y + labelOffsetPoint.y

    const path = geometry.buildPathD()
    const connectorCircles = connectorEntries
      .map(({ local }) => {
        return `<circle cx="${local.xMm}" cy="${local.yMm}" r="${ENDPOINT_CIRCLE_RADIUS}" fill="${EXPORT_BLACK}" stroke="${EXPORT_BLACK}" stroke-width="1" opacity="0.8"/>`
      })
      .join('')

    trackElements.push(`
      <g>
        <g transform="translate(${item.x} ${item.y}) rotate(${item.rotationDeg})">
          <path
            d="${path}"
            fill="${EXPORT_BLACK}"
            stroke="${EXPORT_BLACK}"
            stroke-width="${TRACK_STROKE_WIDTH_MM}"
            stroke-linecap="butt"
            stroke-linejoin="miter"
          />
          ${connectorCircles}
        </g>
        <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="10" fill="${EXPORT_BLACK}">${escapeXml(
          component.id,
        )}</text>
      </g>
    `.trim())

    const localBounds = expandBounds(getLocalBounds(component, TRACK_STROKE_WIDTH_MM), trackBoundsPadding)
    const worldBounds = transformBounds(localBounds, item.x, item.y, item.rotationDeg)
    bounds = mergeBounds(bounds, worldBounds)

    connectorEntries.forEach(({ local }) => {
      const connectorBounds = expandBounds(
        {
          minX: local.xMm,
          maxX: local.xMm,
          minY: local.yMm,
          maxY: local.yMm,
        },
        ENDPOINT_CIRCLE_RADIUS,
      )
      const worldConnectorBounds = transformBounds(connectorBounds, item.x, item.y, item.rotationDeg)
      bounds = mergeBounds(bounds, worldConnectorBounds)
    })
  })

  layout.shapes.forEach((shape) => {
    shapeElements.push(buildShapeElement(shape))
    bounds = mergeBounds(bounds, getShapeBounds(shape))
  })

  if (!bounds) {
    const emptyView = expandBounds({ minX: -100, maxX: 100, minY: -100, maxY: 100 }, padding)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${emptyView.minX} ${emptyView.minY} ${emptyView.maxX - emptyView.minX} ${emptyView.maxY - emptyView.minY}" fill="none"></svg>`
  }

  const padded = expandBounds(bounds, padding)
  const width = padded.maxX - padded.minX
  const height = padded.maxY - padded.minY
  const content = [...trackElements, ...shapeElements].join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${padded.minX} ${padded.minY} ${width} ${height}" fill="none">${content}</svg>`
}
