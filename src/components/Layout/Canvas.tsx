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
import type { EndpointConnection, LayoutState, PlacedItem } from '../../types/layout'
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
import { connectionHasEndpoint, connectionMatchesEndpoints } from '../../utils/connectionUtils'
import { ROTATION_STEP_DEG } from '../../constants/layout'

type CanvasProps = {
  layout: LayoutState | null
  trackSystem: TrackSystemDefinition | null
  onUpdateLayout: (updater: (layout: LayoutState) => LayoutState) => void
  onSelectedItemChange?: (itemId: string | null) => void
  onSelectedEndpointsChange?: (endpoints: EndpointRef[]) => void
  debugMode?: boolean
}

export interface CanvasHandle {
  connectSelectedEndpoints(): void
  disconnectSelectedEndpoints(): void
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
const ENDPOINT_CIRCLE_RADIUS = 8
const ENDPOINT_VECTOR_LENGTH_MM = 24
const TRACK_STROKE_WIDTH_MM = 28
const TRACK_FILL_COLOR = '#1f2937'
const TRACK_BORDER_COLOR = 'darkgrey'
const SELECTED_TRACK_BORDER_COLOR = '#60a5fa'
const SELECTED_ENDPOINT_COLOR = '#dc2626'
const CONNECTED_ENDPOINT_COLOR = '#16a34a'
const GROUNDED_TRACK_BORDER_COLOR = '#facc15'
const LABEL_OFFSET_MM = 18

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  { layout, trackSystem, onUpdateLayout, onSelectedItemChange, onSelectedEndpointsChange, debugMode = false },
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
  const [dragGroupIds, setDragGroupIds] = useState<string[] | null>(null)
  const [dragGroupDelta, setDragGroupDelta] = useState<{ x: number; y: number } | null>(null)
  const [snappedEndpoints, setSnappedEndpoints] = useState<{ moving: EndpointRef; target: EndpointRef } | null>(null)

  const [isPanning, setIsPanning] = useState(false)
  const [camera, setCamera] = useState({
    scale: 1,
    x: -VIEWPORT_SIZE / 2,
    y: -VIEWPORT_SIZE / 2,
  })

  const dragGroupStartTransformsRef = useRef<Record<string, DragPreview> | null>(null)

  const itemMap = useMemo(() => {
    const map = new Map<string, PlacedItem>()
    layout?.placedItems.forEach((item) => map.set(item.id, item))
    return map
  }, [layout])

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

  const connections = layout?.connections ?? []

  const findConnectionForEndpoint = useCallback(
    (endpoint: EndpointRef) => connections.find((connection) => connectionHasEndpoint(connection, endpoint)),
    [connections],
  )

  const connectionGraph = useMemo(() => {
    const graph = new Map<string, Set<string>>()
    connections.forEach((connection) => {
      const [first, second] = connection.endpoints
      if (first.itemId === second.itemId) return
      if (!graph.has(first.itemId)) {
        graph.set(first.itemId, new Set())
      }
      if (!graph.has(second.itemId)) {
        graph.set(second.itemId, new Set())
      }
      graph.get(first.itemId)!.add(second.itemId)
      graph.get(second.itemId)!.add(first.itemId)
    })
    return graph
  }, [connections])

  const getConnectedGroupIds = useCallback(
    (itemId: string) => {
      const result = new Set<string>()
      const queue = [itemId]
      while (queue.length) {
        const current = queue.shift()
        if (!current || result.has(current)) continue
        result.add(current)
        const neighbors = connectionGraph.get(current)
        if (neighbors) {
          neighbors.forEach((neighbor) => queue.push(neighbor))
        }
      }
      if (!result.size) {
        result.add(itemId)
      }
      return Array.from(result)
    },
    [connectionGraph],
  )

  const isItemGrounded = useCallback(
    (itemId: string) => itemMap.get(itemId)?.isGrounded ?? false,
    [itemMap],
  )

  const connectedEndpointKeys = useMemo(() => {
    const set = new Set<string>()
    connections.forEach((connection) => {
      connection.endpoints.forEach(({ itemId, connectorKey }) => {
        set.add(`${itemId}:${connectorKey}`)
      })
    })
    return set
  }, [connections])

  const connectedItemIds = useMemo(() => {
    const set = new Set<string>()
    connections.forEach((connection) => {
      connection.endpoints.forEach(({ itemId }) => {
        set.add(itemId)
      })
    })
    return set
  }, [connections])

  const isEndpointConnected = useCallback(
    (itemId: string, connectorKey: ConnectorKey) =>
      connectedEndpointKeys.has(`${itemId}:${connectorKey}`),
    [connectedEndpointKeys],
  )

  const isItemConnected = useCallback((itemId: string) => connectedItemIds.has(itemId), [connectedItemIds])

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
      const base = dragGroupStartTransformsRef.current?.[item.id]
      if (base && dragGroupDelta && dragGroupIds?.includes(item.id)) {
        return {
          x: base.x + dragGroupDelta.x,
          y: base.y + dragGroupDelta.y,
          rotationDeg: base.rotationDeg,
        }
      }
      if (draggingItemId === item.id && dragPreview) {
        return dragPreview
      }
      return { x: item.x, y: item.y, rotationDeg: item.rotationDeg }
    },
    [dragGroupDelta, dragGroupIds, dragPreview, draggingItemId],
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

  // Auto-connect when dragging ends and endpoints are snapped
  const autoConnectSnappedEndpoints = useCallback(
    (movingRef: EndpointRef, targetRef: EndpointRef) => {
      if (!layout || !trackSystem) return false
      if (movingRef.itemId === targetRef.itemId) return false

      // Don't auto-connect if target item is in the same connected group as moving item
      const movingGroup = getConnectedGroupIds(movingRef.itemId)
      if (movingGroup.includes(targetRef.itemId)) {
        return false
      }

      // Don't auto-connect if either endpoint is already connected
      if (
        isEndpointConnected(movingRef.itemId, movingRef.connectorKey) ||
        isEndpointConnected(targetRef.itemId, targetRef.connectorKey)
      ) {
        return false
      }

      // Don't auto-connect if the moving item is grounded
      if (isItemGrounded(movingRef.itemId)) return false

      const movingItem = layout.placedItems.find((item) => item.id === movingRef.itemId)
      const targetItem = layout.placedItems.find((item) => item.id === targetRef.itemId)
      if (!movingItem || !targetItem) return false
      if (movingItem.trackSystemId !== trackSystem.id || targetItem.trackSystemId !== trackSystem.id) return false

      const movingGeometry = geometryCache.get(movingItem.componentId)
      const targetGeometry = geometryCache.get(targetItem.componentId)
      if (!movingGeometry || !targetGeometry) return false

      const movingConnectorLocal = getConnectorByKey(movingGeometry, movingRef.connectorKey)
      const targetConnectorLocal = getConnectorByKey(targetGeometry, targetRef.connectorKey)
      if (!movingConnectorLocal || !targetConnectorLocal) return false

      // Check width compatibility
      if (Math.abs(targetConnectorLocal.widthMm - movingConnectorLocal.widthMm) > 1e-3) {
        return false
      }

      // Determine which item should be fixed (target) and which should move
      // The item being dragged is always the moving one
      const fixedRef = targetRef
      const movingRefFinal = movingRef

      const transform = computeConnectionTransform(targetItem, targetConnectorLocal, movingConnectorLocal)
      const newConnection: EndpointConnection = { endpoints: [fixedRef, movingRefFinal] }

      const movingGroupIds = getConnectedGroupIds(movingRefFinal.itemId)
      const deltaRotation = normalizeAngle(transform.rotationDeg - movingItem.rotationDeg)
      const pivotBefore = { x: movingItem.x, y: movingItem.y }
      const pivotAfter = { x: transform.position.x, y: transform.position.y }

      onUpdateLayout((previous) => ({
        ...previous,
        placedItems: previous.placedItems.map((item) => {
          if (!movingGroupIds.includes(item.id)) {
            return item
          }

          // Rotate+translate the whole moving group around the moving item pivot
          const rel = { x: item.x - pivotBefore.x, y: item.y - pivotBefore.y }
          const rotated = rotatePointLocal(rel.x, rel.y, deltaRotation)
          const x = pivotAfter.x + rotated.x
          const y = pivotAfter.y + rotated.y

          return {
            ...item,
            x,
            y,
            rotationDeg: normalizeAngle(item.rotationDeg + deltaRotation),
          }
        }),
        connections: [...(previous.connections ?? []), newConnection],
      }))

      return true
    },
    [
      geometryCache,
      getConnectorByKey,
      getConnectedGroupIds,
      isEndpointConnected,
      isItemGrounded,
      layout,
      onUpdateLayout,
      trackSystem,
    ],
  )

  useEffect(() => {
    const handlePointerUp = () => {
      if (draggingItemId) {
        // Try to auto-connect if endpoints are snapped
        let connectionCreated = false
        if (snappedEndpoints) {
          connectionCreated = autoConnectSnappedEndpoints(snappedEndpoints.moving, snappedEndpoints.target)
        }

        // Only update item positions if connection wasn't created (connection already updates positions)
        if (!connectionCreated) {
          const groupStarts = dragGroupStartTransformsRef.current
          const hasGroupDelta =
            dragGroupDelta && (Math.abs(dragGroupDelta.x) > 1e-6 || Math.abs(dragGroupDelta.y) > 1e-6)
          if (groupStarts && dragGroupDelta && hasGroupDelta) {
            onUpdateLayout((previous) => ({
              ...previous,
              placedItems: previous.placedItems.map((item) => {
                const start = groupStarts[item.id]
                if (!start) {
                  return item
                }
                return {
                  ...item,
                  x: start.x + dragGroupDelta.x,
                  y: start.y + dragGroupDelta.y,
                }
              }),
            }))
          } else if (dragPreview) {
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
        }
      }

      setDraggingItemId(null)
      setDragStartClient(null)
      setDragStartTransform(null)
      setDragPreview(null)
      setDragGroupIds(null)
      setDragGroupDelta(null)
      setSnappedEndpoints(null)
      dragGroupStartTransformsRef.current = null
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
  }, [dragGroupDelta, dragPreview, draggingItemId, onUpdateLayout, releasePointer, snappedEndpoints, autoConnectSnappedEndpoints])

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
  // When clicking on a connected endpoint (without shift), automatically select both endpoints for disconnect.
  const updateEndpointSelection = useCallback(
    (endpoint: EndpointRef, additive: boolean) => {
      setSelectedEndpoints((previous) => {
        const exists = previous.some(
          (candidate) => candidate.itemId === endpoint.itemId && candidate.connectorKey === endpoint.connectorKey,
        )

        // Check if this endpoint is connected
        const connection = findConnectionForEndpoint(endpoint)

        let next: EndpointRef[]
        if (additive) {
          // Shift-click: toggle endpoint in selection
          if (exists) {
            // Remove this endpoint from selection
            next = previous.filter(
              (entry) => !(entry.itemId === endpoint.itemId && entry.connectorKey === endpoint.connectorKey),
            )
            // If we removed one endpoint of a connection, also remove the other
            if (connection) {
              const otherEndpoint = connection.endpoints.find(
                (ep) => !(ep.itemId === endpoint.itemId && ep.connectorKey === endpoint.connectorKey),
              )
              if (otherEndpoint) {
                next = next.filter(
                  (entry) => !(entry.itemId === otherEndpoint.itemId && entry.connectorKey === otherEndpoint.connectorKey),
                )
              }
            }
          } else {
            // Add this endpoint to selection
            next = [...previous, endpoint]
            // If this endpoint is connected, also add its partner
            if (connection) {
              const otherEndpoint = connection.endpoints.find(
                (ep) => !(ep.itemId === endpoint.itemId && ep.connectorKey === endpoint.connectorKey),
              )
              if (otherEndpoint && !next.some((ep) => ep.itemId === otherEndpoint.itemId && ep.connectorKey === otherEndpoint.connectorKey)) {
                next.push(otherEndpoint)
              }
            }
            // Limit to 2 endpoints max
            if (next.length > 2) {
              next = next.slice(next.length - 2)
            }
          }
        } else {
          // Normal click: select this endpoint (and its partner if connected)
          if (connection) {
            // Connected endpoint: select both endpoints for disconnect
            next = [...connection.endpoints]
            setSelectedItemId(endpoint.itemId)
            return next
          } else {
            // Unconnected endpoint: select just this one
            next = [endpoint]
          }
        }

        const latest = next[next.length - 1] ?? null
        setSelectedItemId(latest?.itemId ?? null)
        return next
      })
    },
    [findConnectionForEndpoint],
  )

  const clearSelections = useCallback(() => {
    setSelectedItemId(null)
    setSelectedEndpoints([])
  }, [])

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return

    // Check if click is on an endpoint circle (handled by endpoint circle's onPointerDown)
    const targetElement = event.target instanceof Element ? event.target : null
    if (targetElement?.tagName === 'circle' && targetElement.closest('g[data-track-item]')) {
      // Endpoint circle click - let the endpoint handler deal with it
      return
    }

    // Fallback: check for nearby endpoints if not clicking on a circle
    // This handles cases where the endpoint circle might not be clickable
    const worldPoint = clientPointToWorld({ x: event.clientX, y: event.clientY })
    if (worldPoint) {
      const nearest = findNearestEndpoint(worldPoint)
      if (nearest && nearest.distance <= ENDPOINT_CLICK_DISTANCE_MM) {
        const additive = event.shiftKey
        updateEndpointSelection(nearest.ref, additive)
        return
      }
    }

    const clickedTrackItem = targetElement?.closest('[data-track-item]') ?? false
    if(clickedTrackItem) {
      return
    }

    // Background click: start panning and clear selections
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
      const nextTransform = snapped?.transform ?? tentative
      setDragPreview(nextTransform)
      setSnappedEndpoints(snapped?.endpoints ?? null)
      const primaryStart = dragGroupStartTransformsRef.current?.[draggingItemId]
      if (primaryStart) {
        setDragGroupDelta({
          x: nextTransform.x - primaryStart.x,
          y: nextTransform.y - primaryStart.y,
        })
      } else {
        setDragGroupDelta(null)
      }
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
    event: ReactPointerEvent<SVGElement>,
    itemId: string,
    initialTransform: DragPreview,
  ) => {
    event.stopPropagation()
    if (event.button !== 0) return
    const groupIds = getConnectedGroupIds(itemId)
    const groupHasGrounded = groupIds.some((id) => isItemGrounded(id))
    setSelectedItemId(itemId)
    setSelectedEndpoints([])
    if (groupHasGrounded) {
      return
    }

    capturePointer(event.pointerId)
    setDraggingItemId(itemId)
    setDragStartClient({ x: event.clientX, y: event.clientY })
    setDragStartTransform(initialTransform)
    setDragPreview(initialTransform)
    setDragGroupIds(groupIds)
    setDragGroupDelta({ x: 0, y: 0 })

    const startTransforms: Record<string, DragPreview> = {}
    groupIds.forEach((id) => {
      const groupedItem = itemMap.get(id)
      if (groupedItem) {
        startTransforms[id] = {
          x: groupedItem.x,
          y: groupedItem.y,
          rotationDeg: groupedItem.rotationDeg,
        }
      }
    })
    dragGroupStartTransformsRef.current = startTransforms
  }

  const computeSnappedTransform = useCallback(
    (itemId: string, tentative: DragPreview): { transform: DragPreview; endpoints: { moving: EndpointRef; target: EndpointRef } } | null => {
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
      let bestEndpoints: { moving: EndpointRef; target: EndpointRef } | null = null

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

        movingConnectors.forEach(({ key: movingKey, local, world: movingWorld }) => {
          otherConnectors.forEach(({ key: targetKey, world: targetWorld }) => {
            const dx = movingWorld.xMm - targetWorld.xMm
            const dy = movingWorld.yMm - targetWorld.yMm
            const distance = Math.hypot(dx, dy)
            if (distance > SNAP_DISTANCE_MM) return

            const angleDiff = normalizeAngle(movingWorld.directionDeg - (targetWorld.directionDeg + 180))
            if (Math.abs(angleDiff) > ANGLE_TOLERANCE_DEG) return

            // Calculate the rotation needed to align the moving connector with the target
            // desiredDirection is where we want the connector to point in world space
            const desiredDirection = targetWorld.directionDeg + 180
            // Calculate the delta rotation needed from the current world direction
            const deltaRotation = normalizeAngle(desiredDirection - movingWorld.directionDeg)
            // Apply the delta to the current rotation to get the new rotation
            const rotationDeg = normalizeAngle(tentative.rotationDeg + deltaRotation)
            const rotatedLocal = rotatePointLocal(local.xMm, local.yMm, rotationDeg)

            const newTransform: DragPreview = {
              x: targetWorld.xMm - rotatedLocal.x,
              y: targetWorld.yMm - rotatedLocal.y,
              rotationDeg,
            }

            if (distance < bestDistance) {
              bestDistance = distance
              bestTransform = newTransform
              bestEndpoints = {
                moving: { itemId, connectorKey: movingKey },
                target: { itemId: other.id, connectorKey: targetKey },
              }
            }
          })
        })
      })

      if (bestTransform && bestEndpoints) {
        return { transform: bestTransform, endpoints: bestEndpoints }
      }
      return null
    },
    [componentMap, geometryCache, layout, listConnectorEntries, trackSystem],
  )

  // Rotation is shared between toolbar buttons and the R / Shift+R shortcuts so behaviour stays consistent.
  const rotateSelected = useCallback(
    (deltaDeg: number) => {
      if (!layout || !selectedItemId) return
      if (isItemConnected(selectedItemId) || isItemGrounded(selectedItemId)) return

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
      isItemConnected,
      isItemGrounded,
    ],
  )

  const deleteSelectedItem = useCallback(() => {
    if (!layout || !selectedItemId) return

    const filterConnections = (connections?: EndpointConnection[]) =>
      (connections ?? []).filter((connection) =>
        connection.endpoints.every((endpoint) => endpoint.itemId !== selectedItemId),
      )

    onUpdateLayout((previous) => ({
      ...previous,
      placedItems: previous.placedItems.filter((item) => item.id !== selectedItemId),
      connections: filterConnections(previous.connections),
    }))
    setSelectedItemId(null)
    setSelectedEndpoints([])
  }, [layout, onUpdateLayout, selectedItemId])

  // Connect endpoints reuses the same connector math as snapping: match directions, then translate the moving item.
  const connectSelectedEndpoints = useCallback(() => {
    if (!layout || !trackSystem) return
    if (selectedEndpoints.length !== 2) return

    const [firstRef, secondRef] = selectedEndpoints
    if (firstRef.itemId === secondRef.itemId) return

    const firstGrounded = isItemGrounded(firstRef.itemId)
    const secondGrounded = isItemGrounded(secondRef.itemId)

    let fixedRef: EndpointRef | undefined
    let movingRef: EndpointRef | undefined

    if (firstGrounded && !secondGrounded) {
      fixedRef = firstRef
      movingRef = secondRef
    } else if (!firstGrounded && secondGrounded) {
      fixedRef = secondRef
      movingRef = firstRef
    } else {
      // Move the smaller connected group into the larger one to avoid ripping apart existing chains.
      const firstGroup = getConnectedGroupIds(firstRef.itemId)
      const secondGroup = getConnectedGroupIds(secondRef.itemId)
      if (firstGroup.length > secondGroup.length) {
        fixedRef = firstRef
        movingRef = secondRef
      } else if (secondGroup.length > firstGroup.length) {
        fixedRef = secondRef
        movingRef = firstRef
      } else {
        // Tie-breaker: respect explicit user selection or fall back to firstRef.
        const selectedRef =
          selectedEndpoints.find((endpoint) => endpoint.itemId === selectedItemId) ?? firstRef
        movingRef = selectedRef
        fixedRef = selectedRef === firstRef ? secondRef : firstRef
      }
    }

    if (!fixedRef || !movingRef) return
    if (movingRef.itemId === fixedRef.itemId) return
    if (isItemGrounded(movingRef.itemId)) return

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

    if (
      isEndpointConnected(fixedRef.itemId, fixedRef.connectorKey) ||
      isEndpointConnected(movingRef.itemId, movingRef.connectorKey)
    ) {
      return
    }

    if (Math.abs(fixedConnectorLocal.widthMm - movingConnectorLocal.widthMm) > 1e-3) {
      console.warn('Endpoints are not compatible (width mismatch)', {
        fixed: fixedConnectorLocal.widthMm,
        moving: movingConnectorLocal.widthMm,
      })
      return
    }

    const transform = computeConnectionTransform(fixedItem, fixedConnectorLocal, movingConnectorLocal)
    const newConnection: EndpointConnection = { endpoints: [fixedRef, movingRef] }

    const movingGroupIds = getConnectedGroupIds(movingRef.itemId)
    const deltaRotation = normalizeAngle(transform.rotationDeg - movingItem.rotationDeg)
    const pivotBefore = { x: movingItem.x, y: movingItem.y }
    const pivotAfter = { x: transform.position.x, y: transform.position.y }

    onUpdateLayout((previous) => ({
      ...previous,
      placedItems: previous.placedItems.map((item) => {
        if (!movingGroupIds.includes(item.id)) {
          return item
        }

        // Rotate+translate the whole moving group around the moving item pivot
        const rel = { x: item.x - pivotBefore.x, y: item.y - pivotBefore.y }
        const rotated = rotatePointLocal(rel.x, rel.y, deltaRotation)
        const x = pivotAfter.x + rotated.x
        const y = pivotAfter.y + rotated.y

        return {
          ...item,
          x,
          y,
          rotationDeg: normalizeAngle(item.rotationDeg + deltaRotation),
        }
      }),
      connections: [...(previous.connections ?? []), newConnection],
    }))
  }, [
    getConnectorByKey,
    geometryCache,
    isEndpointConnected,
    isItemGrounded,
    layout,
    onUpdateLayout,
    selectedEndpoints,
    selectedItemId,
    trackSystem,
  ])

  const disconnectSelectedEndpoints = useCallback(() => {
    if (!layout || selectedEndpoints.length !== 2) return
    const connectionIndex = (layout.connections ?? []).findIndex((connection) =>
      connectionMatchesEndpoints(connection, selectedEndpoints),
    )
    if (connectionIndex === -1) return

    onUpdateLayout((previous) => ({
      ...previous,
      connections: (previous.connections ?? []).filter((_, idx) => idx !== connectionIndex),
    }))
  }, [layout, onUpdateLayout, selectedEndpoints])

  useImperativeHandle(
    ref,
    () => ({
      connectSelectedEndpoints,
      disconnectSelectedEndpoints,
      rotateSelected,
      deleteSelectedItem,
    }),
    [connectSelectedEndpoints, deleteSelectedItem, disconnectSelectedEndpoints, rotateSelected],
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
            const isGrounded = item.isGrounded ?? false
            const connectorEntries = listConnectorEntries(geometry)
            const labelAnchor = computeLabelAnchor(connectorEntries)
            const trackStrokeColor = isGrounded && !isSelected ? GROUNDED_TRACK_BORDER_COLOR : isSelected ? SELECTED_TRACK_BORDER_COLOR : TRACK_BORDER_COLOR
            const rotatedLabelAnchor = rotatePointLocal(
              labelAnchor.xMm,
              labelAnchor.yMm,
              transform.rotationDeg,
            )
            const labelOffsetPoint = rotatePointLocal(0, -LABEL_OFFSET_MM, transform.rotationDeg)
            const labelX = transform.x + rotatedLabelAnchor.x + labelOffsetPoint.x
            const labelY = transform.y + rotatedLabelAnchor.y + labelOffsetPoint.y

            return (
              <g key={item.id}>
                <g
                  data-track-item={item.id}
                  transform={`translate(${transform.x} ${transform.y}) rotate(${transform.rotationDeg})`}
                  onPointerDown={(event) => handleItemPointerDown(event, item.id, transform)}
                >
                  <path
                    d={geometry.buildPathD()}
                    fill={TRACK_FILL_COLOR}
                    stroke={trackStrokeColor}
                    strokeWidth={TRACK_STROKE_WIDTH_MM}
                    strokeLinecap="butt"
                    strokeLinejoin="miter"
                  />
                {connectorEntries.map(({ key, local }) => {
                  const isEndpointSelected = selectedEndpoints.some(
                    (endpoint) => endpoint.itemId === item.id && endpoint.connectorKey === key,
                  )
                  const isConnectedEndpoint = isEndpointConnected(item.id, key)
                  const endpointFill = isEndpointSelected
                    ? SELECTED_ENDPOINT_COLOR
                    : isConnectedEndpoint
                    ? CONNECTED_ENDPOINT_COLOR
                    : 'transparent'
                  const endpointStroke = isEndpointSelected
                    ? SELECTED_ENDPOINT_COLOR
                    : isConnectedEndpoint
                    ? CONNECTED_ENDPOINT_COLOR
                    : '#cbd5f5'
                  const vectorEndX = local.xMm + (local.dir?.x ?? 0) * ENDPOINT_VECTOR_LENGTH_MM
                  const vectorEndY = local.yMm + (local.dir?.y ?? 0) * ENDPOINT_VECTOR_LENGTH_MM
                  // Position label at the end of the vector, offset slightly
                  const labelOffsetX = (local.dir?.x ?? 0) * (ENDPOINT_VECTOR_LENGTH_MM + 8)
                  const labelOffsetY = (local.dir?.y ?? 0) * (ENDPOINT_VECTOR_LENGTH_MM + 8)
                  const labelX = local.xMm + labelOffsetX
                  const labelY = local.yMm + labelOffsetY
                  const directionDeg = local.directionDeg ?? 0
                  return (
                    <g key={`${item.id}-${key}`}>
                      {debugMode && (
                        <line
                          x1={local.xMm}
                          y1={local.yMm}
                          x2={vectorEndX}
                          y2={vectorEndY}
                          stroke={endpointStroke}
                          strokeWidth={isEndpointSelected || isConnectedEndpoint ? 2 : 1}
                          opacity={0.7}
                          pointerEvents="none"
                        />
                      )}
                      <circle
                        cx={local.xMm}
                        cy={local.yMm}
                        r={ENDPOINT_CIRCLE_RADIUS}
                        fill={endpointFill}
                        stroke={endpointStroke}
                        strokeWidth={isEndpointSelected || isConnectedEndpoint ? 2 : 1}
                        opacity={0.8}
                        style={{ cursor: 'pointer' }}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          event.preventDefault()
                          const additive = event.shiftKey
                          updateEndpointSelection({ itemId: item.id, connectorKey: key }, additive)
                        }}
                      />
                      {debugMode && (
                        <g pointerEvents="none">
                          <rect
                            x={labelX - 20}
                            y={labelY - 8}
                            width={40}
                            height={20}
                            fill="rgba(0, 0, 0, 0.7)"
                            rx={2}
                          />
                          <text
                            x={labelX}
                            y={labelY}
                            fontSize={8}
                            fill="#ffffff"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            style={{ userSelect: 'none', fontFamily: 'monospace' }}
                          >
                            <tspan x={labelX} dy="0">{key}</tspan>
                            <tspan x={labelX} dy="10">{directionDeg.toFixed(1)}°</tspan>
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })}
                </g>
                <text
                  data-track-item={item.id}
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={10}
                  className="fill-gray-300"
                  onPointerDown={(event) => handleItemPointerDown(event, item.id, transform)}
                >
                  {component.id}
                </text>
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
