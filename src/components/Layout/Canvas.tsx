import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react'
import type { LayoutState, PlacedItem } from '../../types/layout'
import type {
  ConnectorKey,
  EndpointRef,
  TrackComponentDefinition,
  TrackConnector,
  TrackSystemDefinition,
  WorldTransform,
} from '../../types/trackSystem'
import {
  getComponentGeometry,
  normalizeAngle,
  rotatePointLocal,
  transformConnector,
} from '../../geometry/trackGeometry'
import { computeConnectionTransform } from '../../geometry/trackEndpoint'
import { ROTATION_STEP_DEG } from '../../constants/layout'

type CanvasProps = {
  layout: LayoutState | null
  trackSystem: TrackSystemDefinition | null
  onUpdateLayout: (updater: (layout: LayoutState) => LayoutState) => void
  onSelectedItemChange?: (itemId: string | null) => void
  onSelectedEndpointsChange?: (endpoints: EndpointRef[]) => void
}

export interface CanvasHandle {
  connectSelectedEndpoints(): void
  rotateSelected(deltaDeg: number): void
  deleteSelectedItem(): void
}

type DragPreview = WorldTransform

type ClientPoint = {
  x: number
  y: number
}

type ConnectorEntry = {
  key: ConnectorKey
  local: TrackConnector
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

const VIEWPORT_SIZE = 1800
const SNAP_DISTANCE_MM = 8
const ANGLE_TOLERANCE_DEG = 15
const ENDPOINT_CLICK_DISTANCE_MM = 10
const ENDPOINT_CIRCLE_RADIUS = 4
const TRACK_STROKE_WIDTH_MM = 28
const TRACK_FILL_COLOR = '#1f2937'
const TRACK_BORDER_COLOR = '#ffffff'
const LABEL_VERTICAL_OFFSET_MM = 18

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  { layout, trackSystem, onUpdateLayout, onSelectedItemChange, onSelectedEndpointsChange },
  ref,
) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const lastPointerRef = useRef<ClientPoint | null>(null)
  const capturedPointerIdRef = useRef<number | null>(null)

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedEndpoints, setSelectedEndpoints] = useState<EndpointRef[]>([])
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [dragStartClient, setDragStartClient] = useState<ClientPoint | null>(null)
  const [dragStartTransform, setDragStartTransform] = useState<DragPreview | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)

  const [isPanning, setIsPanning] = useState(false)
  const [camera, setCamera] = useState({
    scale: 1,
    x: -VIEWPORT_SIZE / 2,
    y: -VIEWPORT_SIZE / 2,
  })

  const componentMap = useMemo(() => {
    if (!trackSystem) return new Map<string, TrackComponentDefinition>()
    const map = new Map<string, TrackComponentDefinition>()
    trackSystem.components.forEach((component) => map.set(component.id, component))
    return map
  }, [trackSystem])

  const geometryCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof getComponentGeometry>>()
    componentMap.forEach((component, id) => {
      cache.set(id, getComponentGeometry(component))
    })
    return cache
  }, [componentMap])

  const capturePointer = useCallback((pointerId: number) => {
    const svg = svgRef.current
    if (!svg) return
    try {
      svg.setPointerCapture(pointerId)
      capturedPointerIdRef.current = pointerId
    } catch {
      capturedPointerIdRef.current = null
    }
  }, [])

  const releasePointer = useCallback(() => {
    const svg = svgRef.current
    const pointerId = capturedPointerIdRef.current
    if (svg && pointerId !== null && svg.hasPointerCapture(pointerId)) {
      svg.releasePointerCapture(pointerId)
    }
    capturedPointerIdRef.current = null
  }, [])

  const ensureSelectionIsValid = useCallback(
    (nextLayout: LayoutState | null) => {
      if (!nextLayout) {
        setSelectedItemId(null)
        setSelectedEndpoints([])
        return
      }

      if (selectedItemId && !nextLayout.placedItems.some((item) => item.id === selectedItemId)) {
        setSelectedItemId(null)
      }

      setSelectedEndpoints((previous) =>
        previous.filter((endpoint) => nextLayout.placedItems.some((item) => item.id === endpoint.itemId)),
      )
    },
    [selectedItemId],
  )

  useEffect(() => {
    ensureSelectionIsValid(layout)
  }, [ensureSelectionIsValid, layout])

  useEffect(() => {
    onSelectedItemChange?.(selectedItemId)
  }, [onSelectedItemChange, selectedItemId])

  useEffect(() => {
    onSelectedEndpointsChange?.(selectedEndpoints)
  }, [onSelectedEndpointsChange, selectedEndpoints])

  useEffect(() => {
    const handlePointerUp = () => {
      if (draggingItemId && dragPreview) {
        onUpdateLayout((previous) => ({
          ...previous,
          placedItems: previous.placedItems.map((item) =>
            item.id === draggingItemId
              ? {
                  ...item,
                  x: dragPreview.x,
                  y: dragPreview.y,
                  rotationDeg: normalizeAngle(dragPreview.rotationDeg),
                }
              : item,
          ),
        }))
      }

      setDraggingItemId(null)
      setDragStartClient(null)
      setDragStartTransform(null)
      setDragPreview(null)
      setIsPanning(false)
      lastPointerRef.current = null
      releasePointer()
    }

    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointerleave', handlePointerUp)
    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointerleave', handlePointerUp)
    }
  }, [draggingItemId, dragPreview, onUpdateLayout, releasePointer])

  const viewWidth = useMemo(() => VIEWPORT_SIZE / camera.scale, [camera.scale])
  const viewHeight = useMemo(() => VIEWPORT_SIZE / camera.scale, [camera.scale])

  const clientPointToWorld = useCallback(
    (point: ClientPoint) => {
      const svg = svgRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight)
      const displayWidth = viewWidth * scale
      const displayHeight = viewHeight * scale
      const offsetX = (rect.width - displayWidth) / 2
      const offsetY = (rect.height - displayHeight) / 2
      if (displayWidth === 0 || displayHeight === 0) {
        return null
      }
      const svgX = point.x - rect.left - offsetX
      const svgY = point.y - rect.top - offsetY
      return {
        x: camera.x + (svgX / displayWidth) * viewWidth,
        y: camera.y + (svgY / displayHeight) * viewHeight,
        rect,
      }
    },
    [camera.x, camera.y, viewWidth, viewHeight],
  )

  const clientDeltaToWorld = useCallback(
    (delta: ClientPoint) => {
      const svg = svgRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight)
      const displayWidth = viewWidth * scale
      const displayHeight = viewHeight * scale
      if (displayWidth === 0 || displayHeight === 0) {
        return null
      }
      return {
        dx: (delta.x / displayWidth) * viewWidth,
        dy: (delta.y / displayHeight) * viewHeight,
      }
    },
    [viewWidth, viewHeight],
  )

  const getItemTransform = useCallback(
    (item: PlacedItem): DragPreview => {
      if (draggingItemId === item.id && dragPreview) {
        return dragPreview
      }
      return { x: item.x, y: item.y, rotationDeg: item.rotationDeg }
    },
    [dragPreview, draggingItemId],
  )

  const listConnectorEntries = useCallback((geometry: ReturnType<typeof getComponentGeometry>): ConnectorEntry[] => {
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
  }, [])

  const getConnectorByKey = useCallback(
    (geometry: ReturnType<typeof getComponentGeometry>, key: ConnectorKey) => {
      if (key === 'start') return geometry.start
      if (key === 'end') return geometry.end
      return geometry.extraConnectors?.[key] ?? null
    },
    [],
  )

  const findNearestEndpoint = useCallback(
    (worldPoint: { x: number; y: number }): { ref: EndpointRef; distance: number } | null => {
      if (!layout || !trackSystem) return null

      let best: { ref: EndpointRef; distance: number } | null = null

      layout.placedItems.forEach((item) => {
        if (item.trackSystemId !== trackSystem.id) return
        const geometry = geometryCache.get(item.componentId)
        if (!geometry) return
        const transform = getItemTransform(item)

        listConnectorEntries(geometry).forEach(({ key, local }) => {
          const connector = transformConnector(local, transform)
          const distance = Math.hypot(connector.xMm - worldPoint.x, connector.yMm - worldPoint.y)
          if (!best || distance < best.distance) {
            best = {
              ref: { itemId: item.id, connectorKey: key },
              distance,
            }
          }
        })
      })

      return best
    },
    [geometryCache, getItemTransform, layout, listConnectorEntries, trackSystem],
  )

  // Endpoint selection toggles connectors with Shift/Ctrl so users can aim two legs before running Connect.
  const updateEndpointSelection = useCallback((endpoint: EndpointRef, additive: boolean) => {
    setSelectedEndpoints((previous) => {
      const exists = previous.some(
        (candidate) => candidate.itemId === endpoint.itemId && candidate.connectorKey === endpoint.connectorKey,
      )

      let next: EndpointRef[]
      if (additive) {
        if (exists) {
          next = previous.filter(
            (entry) => !(entry.itemId === endpoint.itemId && entry.connectorKey === endpoint.connectorKey),
          )
        } else {
          next = [...previous, endpoint]
          if (next.length > 2) {
            next = next.slice(next.length - 2)
          }
        }
      } else {
        next = [endpoint]
      }

      const latest = next[next.length - 1] ?? null
      setSelectedItemId(latest?.itemId ?? null)
      return next
    })
  }, [])

  const clearSelections = useCallback(() => {
    setSelectedItemId(null)
    setSelectedEndpoints([])
  }, [])

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return

    const worldPoint = clientPointToWorld({ x: event.clientX, y: event.clientY })
    if (worldPoint) {
      const nearest = findNearestEndpoint(worldPoint)
      if (nearest && nearest.distance <= ENDPOINT_CLICK_DISTANCE_MM) {
        const additive = event.shiftKey
        updateEndpointSelection(nearest.ref, additive)
        return
      }
    }

    if (event.target !== svgRef.current) return
    event.preventDefault()
    setIsPanning(true)
    capturePointer(event.pointerId)
    lastPointerRef.current = { x: event.clientX, y: event.clientY }
    clearSelections()
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (draggingItemId && dragStartClient && dragStartTransform) {
      event.preventDefault()
      const delta = {
        x: event.clientX - dragStartClient.x,
        y: event.clientY - dragStartClient.y,
      }
      const worldDelta = clientDeltaToWorld(delta)
      if (!worldDelta) return

      const tentative: DragPreview = {
        x: dragStartTransform.x + worldDelta.dx,
        y: dragStartTransform.y + worldDelta.dy,
        rotationDeg: dragStartTransform.rotationDeg,
      }
      const snapped = computeSnappedTransform(draggingItemId, tentative)
      setDragPreview(snapped ?? tentative)
      return
    }

    if (isPanning) {
      const last = lastPointerRef.current
      if (!last) {
        lastPointerRef.current = { x: event.clientX, y: event.clientY }
        return
      }

      const delta = {
        x: event.clientX - last.x,
        y: event.clientY - last.y,
      }
      const worldDelta = clientDeltaToWorld(delta)
      if (!worldDelta) return

      setCamera((prev) => ({
        ...prev,
        x: prev.x - worldDelta.dx,
        y: prev.y - worldDelta.dy,
      }))

      lastPointerRef.current = { x: event.clientX, y: event.clientY }
    }
  }

  const handleWheel = useCallback(
    (event: WheelEvent<SVGSVGElement>) => {
      event.preventDefault()
      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top

      setCamera((prev) => {
        const currentViewWidth = VIEWPORT_SIZE / prev.scale
        const currentViewHeight = VIEWPORT_SIZE / prev.scale
        const worldX = prev.x + (pointerX / rect.width) * currentViewWidth
        const worldY = prev.y + (pointerY / rect.height) * currentViewHeight
        const scaleFactor = event.deltaY > 0 ? 0.85 : 1.15
        const nextScale = Math.min(4, Math.max(0.35, prev.scale * scaleFactor))
        const nextViewWidth = VIEWPORT_SIZE / nextScale
        const nextViewHeight = VIEWPORT_SIZE / nextScale

        return {
          scale: nextScale,
          x: worldX - (pointerX / rect.width) * nextViewWidth,
          y: worldY - (pointerY / rect.height) * nextViewHeight,
        }
      })
    },
    [],
  )

  const handleDragOver = (event: DragEvent<SVGSVGElement>) => {
    if (!layout || !trackSystem) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event: DragEvent<SVGSVGElement>) => {
    if (!layout || !trackSystem) return
    event.preventDefault()
    const payload = event.dataTransfer.getData('application/json')
    if (!payload) return

    const data = JSON.parse(payload) as {
      type: string
      trackSystemId: string
      componentId: string
    }
    if (data.type !== 'track-component' || data.trackSystemId !== trackSystem.id) return

    const worldPoint = clientPointToWorld({ x: event.clientX, y: event.clientY })
    if (!worldPoint) return

    onUpdateLayout((previous) => ({
      ...previous,
      placedItems: [
        ...previous.placedItems,
        {
          id: getId(),
          trackSystemId: trackSystem.id,
          componentId: data.componentId,
          x: worldPoint.x,
          y: worldPoint.y,
          rotationDeg: 0,
        },
      ],
    }))
  }

  const handleItemPointerDown = (
    event: ReactPointerEvent<SVGGElement>,
    itemId: string,
    initialTransform: DragPreview,
  ) => {
    event.stopPropagation()
    if (event.button !== 0) return
    capturePointer(event.pointerId)
    setSelectedItemId(itemId)
    setSelectedEndpoints([])
    setDraggingItemId(itemId)
    setDragStartClient({ x: event.clientX, y: event.clientY })
    setDragStartTransform(initialTransform)
    setDragPreview(initialTransform)
  }

  const computeSnappedTransform = useCallback(
    (itemId: string, tentative: DragPreview) => {
      if (!layout || !trackSystem) return null
      const item = layout.placedItems.find((placed) => placed.id === itemId)
      if (!item) return null
      const component = componentMap.get(item.componentId)
      const geometry = component ? geometryCache.get(component.id) : null
      if (!component || !geometry) return null

      const movingConnectors = listConnectorEntries(geometry).map(({ key, local }) => ({
        key,
        local,
        world: transformConnector(local, tentative),
      }))

      let bestDistance = Number.POSITIVE_INFINITY
      let bestTransform: DragPreview | null = null

      layout.placedItems.forEach((other) => {
        if (other.id === itemId) return
        if (other.trackSystemId !== trackSystem.id) return
        const otherComponent = componentMap.get(other.componentId)
        const otherGeometry = otherComponent ? geometryCache.get(other.componentId) : null
        if (!otherComponent || !otherGeometry) return

        const otherTransform = { x: other.x, y: other.y, rotationDeg: other.rotationDeg }
        const otherConnectors = listConnectorEntries(otherGeometry).map(({ key, local }) => ({
          key,
          world: transformConnector(local, otherTransform),
        }))

        movingConnectors.forEach(({ local, world }) => {
          otherConnectors.forEach((target) => {
            const dx = world.xMm - target.world.xMm
            const dy = world.yMm - target.world.yMm
            const distance = Math.hypot(dx, dy)
            if (distance > SNAP_DISTANCE_MM) return

            const angleDiff = normalizeAngle(world.directionDeg - (target.world.directionDeg + 180))
            if (Math.abs(angleDiff) > ANGLE_TOLERANCE_DEG) return

            const desiredDirection = target.world.directionDeg + 180
            const rotationDeg = normalizeAngle(desiredDirection - local.directionDeg)
            const rotatedLocal = rotatePointLocal(local.xMm, local.yMm, rotationDeg)

            const newTransform: DragPreview = {
              x: target.world.xMm - rotatedLocal.x,
              y: target.world.yMm - rotatedLocal.y,
              rotationDeg,
            }

            if (distance < bestDistance) {
              bestDistance = distance
              bestTransform = newTransform
            }
          })
        })
      })

      return bestTransform
    },
    [componentMap, geometryCache, layout, listConnectorEntries, trackSystem],
  )

  // Rotation is shared between toolbar buttons and the R / Shift+R shortcuts so behaviour stays consistent.
  const rotateSelected = useCallback(
    (deltaDeg: number) => {
      if (!layout || !selectedItemId) return

      const currentItem = layout.placedItems.find((item) => item.id === selectedItemId)
      if (!currentItem) return

      const newRotationDeg = normalizeAngle(currentItem.rotationDeg + deltaDeg)

      const pivotEndpoint = selectedEndpoints.find((endpoint) => endpoint.itemId === selectedItemId)
      const geometry = geometryCache.get(currentItem.componentId) ?? null

      let newX = currentItem.x
      let newY = currentItem.y

      if (pivotEndpoint && geometry) {
        const localConnector = getConnectorByKey(geometry, pivotEndpoint.connectorKey)
        if (localConnector) {
          const pivotWorld = transformConnector(localConnector, {
            x: currentItem.x,
            y: currentItem.y,
            rotationDeg: currentItem.rotationDeg,
          })
          const rotatedLocal = rotatePointLocal(localConnector.xMm, localConnector.yMm, newRotationDeg)
          newX = pivotWorld.xMm - rotatedLocal.x
          newY = pivotWorld.yMm - rotatedLocal.y
        }
      }

      onUpdateLayout((previous) => ({
        ...previous,
        placedItems: previous.placedItems.map((item) =>
          item.id === selectedItemId
            ? { ...item, x: newX, y: newY, rotationDeg: newRotationDeg }
            : item,
        ),
      }))

      setDragPreview((previous) =>
        previous && draggingItemId === selectedItemId
          ? { ...previous, x: newX, y: newY, rotationDeg: newRotationDeg }
          : previous,
      )
    },
    [
      draggingItemId,
      geometryCache,
      getConnectorByKey,
      layout,
      onUpdateLayout,
      selectedEndpoints,
      selectedItemId,
    ],
  )

  const deleteSelectedItem = useCallback(() => {
    if (!layout || !selectedItemId) return
    onUpdateLayout((previous) => ({
      ...previous,
      placedItems: previous.placedItems.filter((item) => item.id !== selectedItemId),
    }))
    setSelectedItemId(null)
    setSelectedEndpoints([])
  }, [layout, onUpdateLayout, selectedItemId])

  // Connect endpoints reuses the same connector math as snapping: match directions, then translate the moving item.
  const connectSelectedEndpoints = useCallback(() => {
    if (!layout || !trackSystem) return
    if (selectedEndpoints.length !== 2) return

    const [fixedRef, movingRef] = selectedEndpoints
    if (fixedRef.itemId === movingRef.itemId) return

    const fixedItem = layout.placedItems.find((item) => item.id === fixedRef.itemId)
    const movingItem = layout.placedItems.find((item) => item.id === movingRef.itemId)
    if (!fixedItem || !movingItem) return
    if (fixedItem.trackSystemId !== trackSystem.id || movingItem.trackSystemId !== trackSystem.id) return

    const fixedGeometry = geometryCache.get(fixedItem.componentId)
    const movingGeometry = geometryCache.get(movingItem.componentId)
    if (!fixedGeometry || !movingGeometry) return

    const fixedConnectorLocal = getConnectorByKey(fixedGeometry, fixedRef.connectorKey)
    const movingConnectorLocal = getConnectorByKey(movingGeometry, movingRef.connectorKey)
    if (!fixedConnectorLocal || !movingConnectorLocal) return

    const transform = computeConnectionTransform(fixedItem, fixedConnectorLocal, movingConnectorLocal)

    onUpdateLayout((previous) => ({
      ...previous,
      placedItems: previous.placedItems.map((item) =>
        item.id === movingItem.id
          ? {
              ...item,
              x: transform.position.x,
              y: transform.position.y,
              rotationDeg: transform.rotationDeg,
            }
          : item,
      ),
    }))
  }, [getConnectorByKey, geometryCache, layout, onUpdateLayout, selectedEndpoints, trackSystem])

  useImperativeHandle(
    ref,
    () => ({
      connectSelectedEndpoints,
      rotateSelected,
      deleteSelectedItem,
    }),
    [connectSelectedEndpoints, deleteSelectedItem, rotateSelected],
  )

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
      }

      if (event.key.toLowerCase() === 'r') {
        if (!selectedItemId) return
        event.preventDefault()
        rotateSelected(event.shiftKey ? -ROTATION_STEP_DEG : ROTATION_STEP_DEG)
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selectedItemId) return
        event.preventDefault()
        deleteSelectedItem()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        clearSelections()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [clearSelections, deleteSelectedItem, rotateSelected, selectedItemId])

  if (!layout || !trackSystem) {
    return (
      <div className="canvas-container flex flex-1 items-center justify-center bg-slate-900 text-sm text-slate-300">
        No active project selected
      </div>
    )
  }

  return (
    <div className="canvas-container flex flex-1 flex-col bg-slate-900 p-4">
      <div className="canvas-wrapper flex h-full w-full overflow-hidden rounded border border-slate-700 bg-slate-950 shadow-inner">
        <svg
          ref={svgRef}
          className="h-full w-full touch-none select-none"
          viewBox={`${camera.x} ${camera.y} ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label="Track layout canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onWheel={handleWheel}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#94a3b8" strokeOpacity="0.15" strokeWidth="1" />
            </pattern>
          </defs>

          <rect
            x={camera.x - viewWidth}
            y={camera.y - viewHeight}
            width={viewWidth * 3}
            height={viewHeight * 3}
            fill="url(#grid)"
          />

          {layout.placedItems.map((item) => {
            const component = componentMap.get(item.componentId)
            const geometry = component ? geometryCache.get(component.id) : null
            if (!component || !geometry) return null

            const transform = getItemTransform(item)
            const isSelected = selectedItemId === item.id
            const connectorEntries = listConnectorEntries(geometry)
            const labelAnchor = computeLabelAnchor(connectorEntries)

            return (
              <g
                key={item.id}
                transform={`translate(${transform.x} ${transform.y}) rotate(${transform.rotationDeg})`}
                onPointerDown={(event) => handleItemPointerDown(event, item.id, transform)}
              >
                <path
                  d={geometry.buildPathD()}
                  fill={TRACK_FILL_COLOR}
                  stroke={isSelected ? '#60a5fa' : TRACK_BORDER_COLOR}
                  strokeWidth={TRACK_STROKE_WIDTH_MM}
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                />
                <text
                  x={labelAnchor.xMm}
                  y={labelAnchor.yMm - LABEL_VERTICAL_OFFSET_MM}
                  textAnchor="middle"
                  fontSize={10}
                  className="fill-gray-300"
                >
                  {component.id}
                </text>
                {connectorEntries.map(({ key, local }) => {
                  const isEndpointSelected = selectedEndpoints.some(
                    (endpoint) => endpoint.itemId === item.id && endpoint.connectorKey === key,
                  )
                  return (
                    <circle
                      key={`${item.id}-${key}`}
                      cx={local.xMm}
                      cy={local.yMm}
                      r={ENDPOINT_CIRCLE_RADIUS}
                      fill={isEndpointSelected ? '#2563eb' : 'transparent'}
                      stroke={isEndpointSelected ? '#93c5fd' : '#cbd5f5'}
                      strokeWidth={isEndpointSelected ? 2 : 1}
                      opacity={0.8}
                      pointerEvents="visibleStroke"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        event.preventDefault()
                        const additive = event.shiftKey || event.ctrlKey || event.metaKey
                        updateEndpointSelection({ itemId: item.id, connectorKey: key }, additive)
                      }}
                    />
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
})

Canvas.displayName = 'Canvas'

// TODO: Render elevation/layer/wiring overlays once those annotations exist in LayoutState.

const getId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
