import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type {
  BasePlaneBoard,
  CanvasDimensionShape,
  CanvasLineShape,
  CanvasPrimitiveShape,
  CanvasShape,
  CanvasTextShape,
  DrawingTool,
  EndpointConnection,
  LayoutState,
  PlacedItem,
} from '../../types/layout';
import type {
  ConnectorKey,
  EndpointRef,
  TrackComponentDefinition,
  TrackSystemDefinition,
  Vec2,
  WorldTransform,
} from '../../types/trackSystem';
import {
  getComponentGeometry,
  normalizeAngle,
  rotatePointLocal,
  transformConnector,
} from '../../geometry/trackGeometry';
import { computeConnectionTransform } from '../../geometry/trackEndpoint';
import { connectionHasEndpoint, connectionMatchesEndpoints } from '../../utils/connectionUtils';
import {
  ROTATION_STEP_DEG,
  TEXT_FONT_SIZE_MM,
  TEXT_DEFAULT_HEIGHT_MM,
  TEXT_DEFAULT_WIDTH_MM,
  DIMENSION_OFFSET_MM,
  DIMENSION_MIN_LENGTH_MM,
  DIMENSION_SNAP_DISTANCE_MM,
  ENDPOINT_CLICK_DISTANCE_MM,
  VIEWPORT_SIZE,
  SNAP_DISTANCE_MM,
  ANGLE_TOLERANCE_DEG,
  SKETCH_SNAP_DISTANCE_MM,
  SKETCH_MIN_LENGTH_MM,
  POLYGON_CLOSE_DISTANCE_MM,
  BASE_PLANE_DEFAULT_THICKNESS_MM,
  BOARD_SNAP_DISTANCE_MM,
} from '../../constants/layout';
import {
  listConnectorEntries as listConnectorEntriesFromGeometry,
  projectPointToSegment,
  boardVertices,
  boardEdges,
  boardPathD,
  basePlaneBounds,
  pointInBoards,
  lineEndpoints,
  lineLength,
} from '../../utils/shapeGeometry';
import { generateId } from '../../utils/idGenerator';
import { TrackItemRenderer } from './canvas/TrackItemRenderer';
import { ShapeRenderer } from './canvas/ShapeRenderer';
import { DrawingPreview } from './canvas/DrawingPreview';

type CanvasProps = {
  layout: LayoutState | null;
  trackSystem: TrackSystemDefinition | null;
  onUpdateLayout: (updater: (layout: LayoutState) => LayoutState) => void;
  onSelectionChange?: (itemIds: string[]) => void;
  onSelectedEndpointsChange?: (endpoints: EndpointRef[]) => void;
  debugMode?: boolean;
  showColors?: boolean;
  drawingTool?: DrawingTool | null;
  undo: () => void;
  redo: () => void;
};

export interface CanvasHandle {
  connectSelectedEndpoints(): void;
  disconnectSelectedEndpoints(): void;
  rotateSelected(deltaDeg: number): void;
  deleteSelectedItem(): void;
  addDimensionBetweenSelectedTracks(type?: 'center' | 'inner' | 'outer'): boolean;
}

type DragPreview = WorldTransform;

type ClientPoint = {
  x: number;
  y: number;
};

const computeRectangleDimensions = (dx: number, dy: number, enforceSquare: boolean) => {
  if (enforceSquare) {
    const size = Math.max(dx, dy);
    return { width: size, height: size };
  }
  return { width: dx, height: dy };
};

const computeTextDimensions = (dx: number, dy: number, enforceSquare: boolean) => {
  const width = Math.max(dx, TEXT_DEFAULT_WIDTH_MM);
  const height = Math.max(dy, TEXT_DEFAULT_HEIGHT_MM);
  if (enforceSquare) {
    const size = Math.max(width, height);
    return { width: size, height: size };
  }
  return { width, height };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const translateBoard = (board: BasePlaneBoard, dx: number, dy: number): BasePlaneBoard =>
  board.kind === 'rect'
    ? { ...board, x: board.x + dx, y: board.y + dy }
    : { ...board, points: board.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };

/** Constrain p to a horizontal/vertical (90°) offset from `last` — for ortho corners. */
const orthoConstrain = (last: Vec2, p: Vec2): Vec2 =>
  Math.abs(p.x - last.x) >= Math.abs(p.y - last.y) ? { x: p.x, y: last.y } : { x: last.x, y: p.y };

const projectPointToRectanglePerimeter = (
  shape: CanvasPrimitiveShape,
  point: { x: number; y: number }
) => {
  const width = shape.width;
  const height = shape.height ?? shape.width;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const local = rotatePointLocal(point.x - shape.x, point.y - shape.y, -shape.rotationDeg);
  const clampedX = clamp(local.x, -halfWidth, halfWidth);
  const clampedY = clamp(local.y, -halfHeight, halfHeight);

  // Snap to closest edge
  const distToVertical = Math.min(Math.abs(clampedX - -halfWidth), Math.abs(clampedX - halfWidth));
  const distToHorizontal = Math.min(
    Math.abs(clampedY - -halfHeight),
    Math.abs(clampedY - halfHeight)
  );
  let snappedLocal: { x: number; y: number };
  if (distToVertical < distToHorizontal) {
    const snapX =
      Math.abs(clampedX + halfWidth) < Math.abs(clampedX - halfWidth) ? -halfWidth : halfWidth;
    snappedLocal = { x: snapX, y: clampedY };
  } else {
    const snapY =
      Math.abs(clampedY + halfHeight) < Math.abs(clampedY - halfHeight) ? -halfHeight : halfHeight;
    snappedLocal = { x: clampedX, y: snapY };
  }

  const rotated = rotatePointLocal(snappedLocal.x, snappedLocal.y, shape.rotationDeg);
  const world = { x: rotated.x + shape.x, y: rotated.y + shape.y };
  const distance = Math.hypot(world.x - point.x, world.y - point.y);
  return { point: world, distance };
};

const projectPointToCirclePerimeter = (
  shape: CanvasPrimitiveShape,
  point: { x: number; y: number }
) => {
  const radius = shape.width / 2;
  const dx = point.x - shape.x;
  const dy = point.y - shape.y;
  const distanceToCenter = Math.hypot(dx, dy);
  if (distanceToCenter < 1e-6) {
    return {
      point: { x: shape.x + radius, y: shape.y },
      distance: radius,
    };
  }
  const scale = radius / distanceToCenter;
  const snapped = { x: shape.x + dx * scale, y: shape.y + dy * scale };
  const distance = Math.abs(distanceToCenter - radius);
  return { point: snapped, distance };
};

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  {
    layout,
    trackSystem,
    onUpdateLayout,
    onSelectionChange,
    onSelectedEndpointsChange,
    debugMode = false,
    showColors = true,
    drawingTool = null,
    undo,
    redo,
  },
  ref
) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastPointerRef = useRef<ClientPoint | null>(null);
  const capturedPointerIdRef = useRef<number | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedEndpoints, setSelectedEndpoints] = useState<EndpointRef[]>([]);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const [dragStartClient, setDragStartClient] = useState<ClientPoint | null>(null);
  const [dragStartTransform, setDragStartTransform] = useState<DragPreview | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [dragGroupIds, setDragGroupIds] = useState<string[] | null>(null);
  const [dragGroupDelta, setDragGroupDelta] = useState<{ x: number; y: number } | null>(null);
  const [snappedEndpoints, setSnappedEndpoints] = useState<{
    moving: EndpointRef;
    target: EndpointRef;
  } | null>(null);
  const [dimensionSelection, setDimensionSelection] = useState<string[]>([]);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [drawShiftActive, setDrawShiftActive] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = useState('');
  const editingTextIsNewRef = useRef(false);
  const textInputRef = useRef<HTMLDivElement | null>(null);

  // Base-plane + sketch state
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [draggingBoardId, setDraggingBoardId] = useState<string | null>(null);
  const [boardDragDelta, setBoardDragDelta] = useState<{ x: number; y: number } | null>(null);
  const boardDragOriginalRef = useRef<BasePlaneBoard | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Vec2[]>([]);
  const [drawSnapHit, setDrawSnapHit] = useState<Vec2 | null>(null);
  // CAD numeric entry while drawing a line / base-plane rectangle.
  const [numericEntry, setNumericEntry] = useState<{
    primary: string;
    secondary: string;
    field: 'primary' | 'secondary';
  } | null>(null);
  // startTextEditing is defined later; finalizeDrawing (defined earlier) reaches it via this ref.
  const startTextEditingRef = useRef<((shape: CanvasTextShape, isNew?: boolean) => void) | null>(
    null
  );

  const [isPanning, setIsPanning] = useState(false);
  const [camera, setCamera] = useState({
    scale: 1,
    x: -VIEWPORT_SIZE / 2,
    y: -VIEWPORT_SIZE / 2,
  });

  const dragGroupStartTransformsRef = useRef<Record<string, DragPreview> | null>(null);

  const itemMap = useMemo(() => {
    const map = new Map<string, PlacedItem>();
    layout?.placedItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [layout]);

  const componentMap = useMemo(() => {
    if (!trackSystem) return new Map<string, TrackComponentDefinition>();
    const map = new Map<string, TrackComponentDefinition>();
    trackSystem.components.forEach((component) => map.set(component.id, component));
    return map;
  }, [trackSystem]);

  const geometryCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof getComponentGeometry>>();
    componentMap.forEach((component, id) => {
      cache.set(id, getComponentGeometry(component));
    });
    return cache;
  }, [componentMap]);

  // Placed items whose center falls outside every base-plane board (flagged in the UI).
  const offBoardItemIds = useMemo(() => {
    const boards = layout?.basePlane?.boards;
    if (!layout || !boards || boards.length === 0) return new Set<string>();
    const ids = new Set<string>();
    layout.placedItems.forEach((item) => {
      if (!pointInBoards({ x: item.x, y: item.y }, boards)) ids.add(item.id);
    });
    return ids;
  }, [layout]);

  const connections = layout?.connections ?? [];

  const findConnectionForEndpoint = useCallback(
    (endpoint: EndpointRef) =>
      connections.find((connection) => connectionHasEndpoint(connection, endpoint)),
    [connections]
  );

  const connectionGraph = useMemo(() => {
    const graph = new Map<string, Set<string>>();
    connections.forEach((connection) => {
      const [first, second] = connection.endpoints;
      if (first.itemId === second.itemId) return;
      if (!graph.has(first.itemId)) {
        graph.set(first.itemId, new Set());
      }
      if (!graph.has(second.itemId)) {
        graph.set(second.itemId, new Set());
      }
      graph.get(first.itemId)!.add(second.itemId);
      graph.get(second.itemId)!.add(first.itemId);
    });
    return graph;
  }, [connections]);

  const getConnectedGroupIds = useCallback(
    (itemId: string) => {
      const result = new Set<string>();
      const queue = [itemId];
      while (queue.length) {
        const current = queue.shift();
        if (!current || result.has(current)) continue;
        result.add(current);
        const neighbors = connectionGraph.get(current);
        if (neighbors) {
          neighbors.forEach((neighbor) => queue.push(neighbor));
        }
      }
      if (!result.size) {
        result.add(itemId);
      }
      return Array.from(result);
    },
    [connectionGraph]
  );

  const isItemGrounded = useCallback(
    (itemId: string) => itemMap.get(itemId)?.isGrounded ?? false,
    [itemMap]
  );

  const { connectedEndpointKeys, connectedItemIds } = useMemo(() => {
    const endpointKeys = new Set<string>();
    const itemIds = new Set<string>();
    connections.forEach((connection) => {
      connection.endpoints.forEach(({ itemId, connectorKey }) => {
        endpointKeys.add(`${itemId}:${connectorKey}`);
        itemIds.add(itemId);
      });
    });
    return { connectedEndpointKeys: endpointKeys, connectedItemIds: itemIds };
  }, [connections]);

  const isEndpointConnected = useCallback(
    (itemId: string, connectorKey: ConnectorKey) =>
      connectedEndpointKeys.has(`${itemId}:${connectorKey}`),
    [connectedEndpointKeys]
  );

  const isItemConnected = useCallback(
    (itemId: string) => connectedItemIds.has(itemId),
    [connectedItemIds]
  );

  const capturePointer = useCallback((pointerId: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      svg.setPointerCapture(pointerId);
      capturedPointerIdRef.current = pointerId;
    } catch {
      capturedPointerIdRef.current = null;
    }
  }, []);

  const releasePointer = useCallback(() => {
    const svg = svgRef.current;
    const pointerId = capturedPointerIdRef.current;
    if (svg && pointerId !== null && svg.hasPointerCapture(pointerId)) {
      svg.releasePointerCapture(pointerId);
    }
    capturedPointerIdRef.current = null;
  }, []);

  // Validate selections when layout changes — uses functional updaters to avoid stale closures
  useEffect(() => {
    if (!layout) {
      setSelectedItemIds(new Set());
      setSelectedShapeId(null);
      setSelectedBoardId(null);
      setSelectedEndpoints([]);
      setDimensionSelection([]);
      return;
    }

    const itemIdSet = new Set(layout.placedItems.map((item) => item.id));
    const shapeIdSet = new Set(layout.shapes.map((shape) => shape.id));
    const boardIdSet = new Set(layout.basePlane?.boards.map((board) => board.id) ?? []);
    setSelectedBoardId((prev) => (prev && !boardIdSet.has(prev) ? null : prev));

    setSelectedItemIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set<string>();
      prev.forEach((id) => {
        if (itemIdSet.has(id)) validIds.add(id);
      });
      return validIds.size !== prev.size ? validIds : prev;
    });

    setSelectedShapeId((prev) => (prev && !shapeIdSet.has(prev) ? null : prev));
    setEditingTextId((prev) => (prev && !shapeIdSet.has(prev) ? null : prev));

    setSelectedEndpoints((prev) => prev.filter((endpoint) => itemIdSet.has(endpoint.itemId)));
  }, [layout]);

  // Reset in-progress drawing state when the active tool changes.
  useEffect(() => {
    setPolygonPoints([]);
    setNumericEntry(null);
    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
    setDrawSnapHit(null);
  }, [drawingTool]);

  useEffect(() => {
    onSelectionChange?.(Array.from(selectedItemIds));
  }, [onSelectionChange, selectedItemIds]);

  useEffect(() => {
    onSelectedEndpointsChange?.(selectedEndpoints);
  }, [onSelectedEndpointsChange, selectedEndpoints]);

  useEffect(() => {
    const element = textInputRef.current;
    if (!element || editingTextId === null) {
      return;
    }

    if (element.textContent !== editingTextValue) {
      element.textContent = editingTextValue;
    }
    element.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [editingTextId, editingTextValue]);

  const viewWidth = useMemo(() => VIEWPORT_SIZE / camera.scale, [camera.scale]);
  const viewHeight = useMemo(() => VIEWPORT_SIZE / camera.scale, [camera.scale]);

  const clientPointToWorld = useCallback(
    (point: ClientPoint) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight);
      const displayWidth = viewWidth * scale;
      const displayHeight = viewHeight * scale;
      const offsetX = (rect.width - displayWidth) / 2;
      const offsetY = (rect.height - displayHeight) / 2;
      if (displayWidth === 0 || displayHeight === 0) {
        return null;
      }
      const svgX = point.x - rect.left - offsetX;
      const svgY = point.y - rect.top - offsetY;
      return {
        x: camera.x + (svgX / displayWidth) * viewWidth,
        y: camera.y + (svgY / displayHeight) * viewHeight,
        rect,
      };
    },
    [camera.x, camera.y, viewWidth, viewHeight]
  );

  const clientDeltaToWorld = useCallback(
    (delta: ClientPoint) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight);
      const displayWidth = viewWidth * scale;
      const displayHeight = viewHeight * scale;
      if (displayWidth === 0 || displayHeight === 0) {
        return null;
      }
      return {
        dx: (delta.x / displayWidth) * viewWidth,
        dy: (delta.y / displayHeight) * viewHeight,
      };
    },
    [viewWidth, viewHeight]
  );

  const listConnectorEntries = listConnectorEntriesFromGeometry;

  const getConnectorByKey = useCallback(
    (geometry: ReturnType<typeof getComponentGeometry>, key: ConnectorKey) => {
      if (key === 'start') return geometry.start;
      if (key === 'end') return geometry.end;
      return geometry.extraConnectors?.[key] ?? null;
    },
    []
  );

  // Unified snapping for sketch + dimension tools: snaps the cursor to track
  // endpoints, item centers, drawn line endpoints/segments, base-plane board
  // vertices/edges, and rectangle/circle perimeters.
  const snapSketchPoint = useCallback(
    (point: { x: number; y: number }, maxDistance: number = SKETCH_SNAP_DISTANCE_MM) => {
      let bestPoint: Vec2 = point;
      let bestDistance = maxDistance;
      let snapped = false;

      const consider = (candidate: Vec2, distance: number) => {
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPoint = candidate;
          snapped = true;
        }
      };

      layout?.placedItems.forEach((item) => {
        consider({ x: item.x, y: item.y }, Math.hypot(item.x - point.x, item.y - point.y));

        const geometry = geometryCache.get(item.componentId);
        if (!geometry) return;
        const transform = { x: item.x, y: item.y, rotationDeg: item.rotationDeg };
        listConnectorEntries(geometry).forEach(({ local }) => {
          const connector = transformConnector(local, transform);
          consider(
            { x: connector.xMm, y: connector.yMm },
            Math.hypot(connector.xMm - point.x, connector.yMm - point.y)
          );
        });
      });

      layout?.shapes.forEach((shape) => {
        if (shape.type === 'rectangle') {
          const projection = projectPointToRectanglePerimeter(shape, point);
          consider(projection.point, projection.distance);
        } else if (shape.type === 'circle') {
          const projection = projectPointToCirclePerimeter(shape, point);
          consider(projection.point, projection.distance);
        } else if (shape.type === 'line') {
          const [a, b] = lineEndpoints(shape);
          consider(a, Math.hypot(a.x - point.x, a.y - point.y));
          consider(b, Math.hypot(b.x - point.x, b.y - point.y));
          const projection = projectPointToSegment(point, a, b);
          consider(projection.point, projection.distance);
        }
      });

      layout?.basePlane?.boards.forEach((board) => {
        boardVertices(board).forEach((v) => consider(v, Math.hypot(v.x - point.x, v.y - point.y)));
        boardEdges(board).forEach(([a, b]) => {
          const projection = projectPointToSegment(point, a, b);
          consider(projection.point, projection.distance);
        });
      });

      return { x: bestPoint.x, y: bestPoint.y, snapped };
    },
    [geometryCache, layout]
  );

  // Snap a dragged board's translation so its edges align/abut other boards' edges
  // (axis-aligned bounding edges) when within BOARD_SNAP_DISTANCE_MM.
  const snapBoardDelta = useCallback(
    (original: BasePlaneBoard, dx: number, dy: number) => {
      const boards = layout?.basePlane?.boards;
      const base = basePlaneBounds([original]);
      if (!boards || !base) return { x: dx, y: dy };
      const bb = {
        minX: base.minX + dx,
        maxX: base.maxX + dx,
        minY: base.minY + dy,
        maxY: base.maxY + dy,
      };
      const thr = BOARD_SNAP_DISTANCE_MM;
      let bestX: number | null = null;
      let bestY: number | null = null;
      const consider = (cur: number, target: number, axis: 'x' | 'y') => {
        const adj = target - cur;
        if (Math.abs(adj) > thr) return;
        if (axis === 'x') {
          if (bestX === null || Math.abs(adj) < Math.abs(bestX)) bestX = adj;
        } else if (bestY === null || Math.abs(adj) < Math.abs(bestY)) {
          bestY = adj;
        }
      };
      for (const other of boards) {
        if (other.id === original.id) continue;
        const ob = basePlaneBounds([other]);
        if (!ob) continue;
        const yNear = bb.minY <= ob.maxY + thr && bb.maxY >= ob.minY - thr;
        const xNear = bb.minX <= ob.maxX + thr && bb.maxX >= ob.minX - thr;
        if (yNear) {
          consider(bb.minX, ob.minX, 'x');
          consider(bb.minX, ob.maxX, 'x');
          consider(bb.maxX, ob.minX, 'x');
          consider(bb.maxX, ob.maxX, 'x');
        }
        if (xNear) {
          consider(bb.minY, ob.minY, 'y');
          consider(bb.minY, ob.maxY, 'y');
          consider(bb.maxY, ob.minY, 'y');
          consider(bb.maxY, ob.maxY, 'y');
        }
      }
      return { x: dx + (bestX ?? 0), y: dy + (bestY ?? 0) };
    },
    [layout]
  );

  const getItemTransform = useCallback(
    (item: PlacedItem): DragPreview => {
      const base = dragGroupStartTransformsRef.current?.[item.id];
      if (base && dragGroupDelta && dragGroupIds?.includes(item.id)) {
        return {
          x: base.x + dragGroupDelta.x,
          y: base.y + dragGroupDelta.y,
          rotationDeg: base.rotationDeg,
        };
      }
      if (draggingItemId === item.id && dragPreview) {
        return dragPreview;
      }
      return { x: item.x, y: item.y, rotationDeg: item.rotationDeg };
    },
    [dragGroupDelta, dragGroupIds, dragPreview, draggingItemId]
  );

  const getItemCenterDirection = useCallback(
    (item: PlacedItem) => {
      const geometry = geometryCache.get(item.componentId);
      if (!geometry) return null;
      const start = transformConnector(geometry.start, {
        x: item.x,
        y: item.y,
        rotationDeg: item.rotationDeg,
      });
      const end = transformConnector(geometry.end, {
        x: item.x,
        y: item.y,
        rotationDeg: item.rotationDeg,
      });
      const dx = end.xMm - start.xMm;
      const dy = end.yMm - start.yMm;
      const length = Math.hypot(dx, dy);
      if (length < 1e-3) return null;
      return { center: { x: item.x, y: item.y }, dir: { x: dx / length, y: dy / length } };
    },
    [geometryCache]
  );

  // Auto-connect when dragging ends and endpoints are snapped
  const autoConnectSnappedEndpoints = useCallback(
    (movingRef: EndpointRef, targetRef: EndpointRef) => {
      if (!layout || !trackSystem) return false;
      if (movingRef.itemId === targetRef.itemId) return false;

      // Don't auto-connect if target item is in the same connected group as moving item
      const movingGroupIds = getConnectedGroupIds(movingRef.itemId);
      if (movingGroupIds.includes(targetRef.itemId)) {
        return false;
      }

      // Don't auto-connect if either endpoint is already connected
      if (
        isEndpointConnected(movingRef.itemId, movingRef.connectorKey) ||
        isEndpointConnected(targetRef.itemId, targetRef.connectorKey)
      ) {
        return false;
      }

      // Don't auto-connect if the moving item is grounded
      if (isItemGrounded(movingRef.itemId)) return false;

      const movingItem = layout.placedItems.find((item) => item.id === movingRef.itemId);
      const targetItem = layout.placedItems.find((item) => item.id === targetRef.itemId);
      if (!movingItem || !targetItem) return false;
      if (
        movingItem.trackSystemId !== trackSystem.id ||
        targetItem.trackSystemId !== trackSystem.id
      )
        return false;

      const movingGeometry = geometryCache.get(movingItem.componentId);
      const targetGeometry = geometryCache.get(targetItem.componentId);
      if (!movingGeometry || !targetGeometry) return false;

      const movingConnectorLocal = getConnectorByKey(movingGeometry, movingRef.connectorKey);
      const targetConnectorLocal = getConnectorByKey(targetGeometry, targetRef.connectorKey);
      if (!movingConnectorLocal || !targetConnectorLocal) return false;

      // Check width compatibility
      if (Math.abs(targetConnectorLocal.widthMm - movingConnectorLocal.widthMm) > 1e-3) {
        return false;
      }

      // Calculate the transform for the moving item to snap to the target
      const transform = computeConnectionTransform(
        targetItem,
        targetConnectorLocal,
        movingConnectorLocal
      );

      // Calculate group movement parameters
      const deltaRotation = normalizeAngle(transform.rotationDeg - movingItem.rotationDeg);
      const pivotBefore = { x: movingItem.x, y: movingItem.y };
      const pivotAfter = { x: transform.position.x, y: transform.position.y };

      // 1. Calculate new positions for all items in the moving group
      const newPlacedItems = layout.placedItems.map((item) => {
        if (!movingGroupIds.includes(item.id)) {
          return item;
        }

        // Rotate+translate the whole moving group around the moving item pivot
        const rel = { x: item.x - pivotBefore.x, y: item.y - pivotBefore.y };
        const rotated = rotatePointLocal(rel.x, rel.y, deltaRotation);
        const x = pivotAfter.x + rotated.x;
        const y = pivotAfter.y + rotated.y;

        return {
          ...item,
          x,
          y,
          rotationDeg: normalizeAngle(item.rotationDeg + deltaRotation),
        };
      });

      // 2. Find ALL valid connections between the moving group (at new positions) and stationary items
      const newConnections: EndpointConnection[] = [];
      const stationaryItems = newPlacedItems.filter((item) => !movingGroupIds.includes(item.id));
      const movingItemsNew = newPlacedItems.filter((item) => movingGroupIds.includes(item.id));

      // Helper to check if an endpoint is already used in our *new* connections list
      const isUsedInNewConnections = (itemId: string, key: string) => {
        return newConnections.some((conn) =>
          conn.endpoints.some((ep) => ep.itemId === itemId && ep.connectorKey === key)
        );
      };

      // Iterate through all moving items at their NEW positions
      movingItemsNew.forEach((movingItemNew) => {
        const geometry = geometryCache.get(movingItemNew.componentId);
        if (!geometry) return;

        const movingTransform = {
          x: movingItemNew.x,
          y: movingItemNew.y,
          rotationDeg: movingItemNew.rotationDeg,
        };

        listConnectorEntries(geometry).forEach(({ key: movingKey, local: movingLocal }) => {
          if (isEndpointConnected(movingItemNew.id, movingKey)) return;
          if (isUsedInNewConnections(movingItemNew.id, movingKey)) return;

          const movingWorld = transformConnector(movingLocal, movingTransform);

          // Check against all stationary items
          stationaryItems.forEach((stationaryItem) => {
            const statGeometry = geometryCache.get(stationaryItem.componentId);
            if (!statGeometry) return;

            const statTransform = {
              x: stationaryItem.x,
              y: stationaryItem.y,
              rotationDeg: stationaryItem.rotationDeg,
            };

            listConnectorEntries(statGeometry).forEach(({ key: statKey, local: statLocal }) => {
              if (isEndpointConnected(stationaryItem.id, statKey)) return;
              if (isUsedInNewConnections(stationaryItem.id, statKey)) return;

              const statWorld = transformConnector(statLocal, statTransform);

              // Distance check
              const dist = Math.hypot(
                movingWorld.xMm - statWorld.xMm,
                movingWorld.yMm - statWorld.yMm
              );
              if (dist > 1.0) return; // Use a tight tolerance since we already snapped the primary one

              // Angle check
              const angleDiff = normalizeAngle(
                movingWorld.directionDeg - (statWorld.directionDeg + 180)
              );
              if (Math.abs(angleDiff) > 5.0) return; // Tight angle tolerance

              // Width check
              if (Math.abs(movingLocal.widthMm - statLocal.widthMm) > 1e-3) return;

              // Found a match!
              newConnections.push({
                endpoints: [
                  { itemId: stationaryItem.id, connectorKey: statKey },
                  { itemId: movingItemNew.id, connectorKey: movingKey },
                ],
              });
            });
          });
        });
      });

      // If for some reason the primary connection wasn't found (e.g. slight float error), force add it
      const primaryExists = newConnections.some(
        (conn) =>
          conn.endpoints.some(
            (ep) => ep.itemId === targetRef.itemId && ep.connectorKey === targetRef.connectorKey
          ) &&
          conn.endpoints.some(
            (ep) => ep.itemId === movingRef.itemId && ep.connectorKey === movingRef.connectorKey
          )
      );

      if (!primaryExists) {
        newConnections.push({ endpoints: [targetRef, movingRef] });
      }

      onUpdateLayout((previous) => ({
        ...previous,
        placedItems: newPlacedItems,
        connections: [...(previous.connections ?? []), ...newConnections],
      }));

      return true;
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
    ]
  );

  // Commit the in-progress drag-drawing (circle/rect/text/dimension/line/base-plane rect).
  // Shared by pointer-up and the numeric-entry Enter key. Numeric values, when typed,
  // override the dragged magnitude (length for line, width/height for rectangles).
  const finalizeDrawing = useCallback(() => {
    if (!isDrawing || !drawStart || !drawCurrent || !drawingTool) return;
    if (drawingTool === 'basePlanePolygon') return;

    const rawDx = drawCurrent.x - drawStart.x;
    const rawDy = drawCurrent.y - drawStart.y;
    const absDx = Math.abs(rawDx);
    const absDy = Math.abs(rawDy);
    const centerX = (drawStart.x + drawCurrent.x) / 2;
    const centerY = (drawStart.y + drawCurrent.y) / 2;
    const parse = (value: string): number | null => {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    let newShape: CanvasShape | null = null;
    let newBoard: BasePlaneBoard | null = null;
    let textToEdit: CanvasTextShape | null = null;

    if (drawingTool === 'circle') {
      if (absDx > 1 || absDy > 1) {
        const radius = Math.hypot(absDx, absDy) / 2;
        newShape = {
          id: generateId(),
          type: 'circle',
          x: centerX,
          y: centerY,
          width: radius * 2,
          rotationDeg: 0,
        };
      }
    } else if (drawingTool === 'rectangle' || drawingTool === 'basePlaneRect') {
      const numW = numericEntry ? parse(numericEntry.primary) : null;
      const numH = numericEntry ? parse(numericEntry.secondary) : null;
      const dims = computeRectangleDimensions(absDx, absDy, drawShiftActive);
      const width = numW ?? dims.width;
      const height = numH ?? dims.height;
      // With a typed dimension, grow from the start corner toward the drag direction.
      const signX = rawDx >= 0 ? 1 : -1;
      const signY = rawDy >= 0 ? 1 : -1;
      const cx = numW != null ? drawStart.x + (signX * width) / 2 : centerX;
      const cy = numH != null ? drawStart.y + (signY * height) / 2 : centerY;
      if (width > SKETCH_MIN_LENGTH_MM && height > SKETCH_MIN_LENGTH_MM) {
        if (drawingTool === 'basePlaneRect') {
          newBoard = {
            id: generateId(),
            kind: 'rect',
            x: cx,
            y: cy,
            width,
            height,
            rotationDeg: 0,
          };
        } else {
          newShape = {
            id: generateId(),
            type: 'rectangle',
            x: cx,
            y: cy,
            width,
            height,
            rotationDeg: 0,
          };
        }
      }
    } else if (drawingTool === 'line') {
      let lx = rawDx;
      let ly = rawDy;
      if (drawShiftActive) {
        if (Math.abs(lx) > Math.abs(ly)) ly = 0;
        else lx = 0;
      }
      let length = Math.hypot(lx, ly);
      const numLen = numericEntry ? parse(numericEntry.primary) : null;
      if (numLen != null) {
        if (length > 1e-6) {
          const scale = numLen / length;
          lx *= scale;
          ly *= scale;
        } else {
          lx = numLen;
          ly = 0;
        }
        length = numLen;
      }
      if (length >= SKETCH_MIN_LENGTH_MM) {
        newShape = {
          id: generateId(),
          type: 'line',
          x1: drawStart.x,
          y1: drawStart.y,
          x2: drawStart.x + lx,
          y2: drawStart.y + ly,
        };
      }
    } else if (drawingTool === 'text') {
      const dims = computeTextDimensions(absDx, absDy, drawShiftActive);
      textToEdit = {
        id: generateId(),
        type: 'text',
        x: centerX,
        y: centerY,
        width: dims.width,
        height: dims.height,
        text: '',
        fontSize: TEXT_FONT_SIZE_MM,
        rotationDeg: 0,
      };
      newShape = textToEdit;
    } else if (drawingTool === 'dimension') {
      let dimensionDx = rawDx;
      let dimensionDy = rawDy;
      if (drawShiftActive) {
        if (Math.abs(dimensionDx) > Math.abs(dimensionDy)) dimensionDy = 0;
        else dimensionDx = 0;
      }
      const length = Math.hypot(dimensionDx, dimensionDy);
      if (length >= DIMENSION_MIN_LENGTH_MM) {
        newShape = {
          id: generateId(),
          type: 'dimension',
          x: drawStart.x + dimensionDx / 2,
          y: drawStart.y + dimensionDy / 2,
          length,
          rotationDeg: normalizeAngle((Math.atan2(dimensionDy, dimensionDx) * 180) / Math.PI),
          offsetMm: DIMENSION_OFFSET_MM,
        };
      }
    }

    if (newShape) {
      const shape = newShape;
      onUpdateLayout((previous) => ({ ...previous, shapes: [...previous.shapes, shape] }));
      if (textToEdit) {
        const text = textToEdit;
        startTextEditingRef.current?.(text, true);
      }
    } else if (newBoard) {
      const board = newBoard;
      onUpdateLayout((previous) => ({
        ...previous,
        basePlane: {
          boards: [...(previous.basePlane?.boards ?? []), board],
          thicknessMm: previous.basePlane?.thicknessMm ?? BASE_PLANE_DEFAULT_THICKNESS_MM,
        },
      }));
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
    setDrawShiftActive(false);
    setNumericEntry(null);
    setDrawSnapHit(null);
  }, [
    isDrawing,
    drawStart,
    drawCurrent,
    drawingTool,
    drawShiftActive,
    numericEntry,
    onUpdateLayout,
  ]);

  // Commit / cancel an in-progress base-plane polygon.
  const commitPolygon = useCallback(() => {
    if (polygonPoints.length >= 3) {
      const board: BasePlaneBoard = {
        id: generateId(),
        kind: 'polygon',
        points: polygonPoints.map((p) => ({ x: p.x, y: p.y })),
      };
      onUpdateLayout((previous) => ({
        ...previous,
        basePlane: {
          boards: [...(previous.basePlane?.boards ?? []), board],
          thicknessMm: previous.basePlane?.thicknessMm ?? BASE_PLANE_DEFAULT_THICKNESS_MM,
        },
      }));
    }
    setPolygonPoints([]);
    setDrawCurrent(null);
    setDrawSnapHit(null);
  }, [polygonPoints, onUpdateLayout]);

  // Place the next polygon vertex at an exact distance along the current cursor
  // direction from the last vertex (CAD: type a length, Enter).
  const addPolygonVertexAtLength = useCallback(
    (lengthMm: number) => {
      setPolygonPoints((prev) => {
        const last = prev[prev.length - 1];
        if (!last || !drawCurrent) return prev;
        let dx = drawCurrent.x - last.x;
        let dy = drawCurrent.y - last.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          dx = 1;
          dy = 0;
        } else {
          dx /= d;
          dy /= d;
        }
        return [...prev, { x: last.x + dx * lengthMm, y: last.y + dy * lengthMm }];
      });
      setNumericEntry(null);
    },
    [drawCurrent]
  );

  useEffect(() => {
    const handlePointerUp = () => {
      finalizeDrawing();

      // Finalize base-plane board dragging
      if (draggingBoardId && boardDragDelta && boardDragOriginalRef.current) {
        const { x: dx, y: dy } = boardDragDelta;
        const boardId = draggingBoardId;
        if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
          onUpdateLayout((previous) => {
            if (!previous.basePlane) return previous;
            return {
              ...previous,
              basePlane: {
                ...previous.basePlane,
                boards: previous.basePlane.boards.map((b) =>
                  b.id === boardId ? translateBoard(b, dx, dy) : b
                ),
              },
            };
          });
        }
      }

      // Finalize shape dragging
      if (draggingShapeId && dragPreview) {
        onUpdateLayout((previous) => ({
          ...previous,
          shapes: previous.shapes.map((shape) =>
            shape.id === draggingShapeId
              ? {
                  ...shape,
                  x: dragPreview.x,
                  y: dragPreview.y,
                  rotationDeg: normalizeAngle(dragPreview.rotationDeg),
                }
              : shape
          ),
        }));
      }

      if (draggingItemId) {
        // Try to auto-connect if endpoints are snapped
        let connectionCreated = false;
        if (snappedEndpoints) {
          connectionCreated = autoConnectSnappedEndpoints(
            snappedEndpoints.moving,
            snappedEndpoints.target
          );
        }

        // Only update item positions if connection wasn't created (connection already updates positions)
        if (!connectionCreated) {
          const groupStarts = dragGroupStartTransformsRef.current;
          const hasGroupDelta =
            dragGroupDelta &&
            (Math.abs(dragGroupDelta.x) > 1e-6 || Math.abs(dragGroupDelta.y) > 1e-6);
          if (groupStarts && dragGroupDelta && hasGroupDelta) {
            onUpdateLayout((previous) => ({
              ...previous,
              placedItems: previous.placedItems.map((item) => {
                const start = groupStarts[item.id];
                if (!start) {
                  return item;
                }
                return {
                  ...item,
                  x: start.x + dragGroupDelta.x,
                  y: start.y + dragGroupDelta.y,
                };
              }),
            }));
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
                  : item
              ),
            }));
          }
        }
      }

      setDraggingItemId(null);
      setDraggingShapeId(null);
      setDraggingBoardId(null);
      setBoardDragDelta(null);
      boardDragOriginalRef.current = null;
      setDragStartClient(null);
      setDragStartTransform(null);
      setDragPreview(null);
      setDragGroupIds(null);
      setDragGroupDelta(null);
      setSnappedEndpoints(null);
      dragGroupStartTransformsRef.current = null;
      setIsPanning(false);
      lastPointerRef.current = null;
      releasePointer();
    };

    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointerleave', handlePointerUp);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointerleave', handlePointerUp);
    };
  }, [
    autoConnectSnappedEndpoints,
    boardDragDelta,
    dragGroupDelta,
    dragPreview,
    draggingBoardId,
    draggingItemId,
    draggingShapeId,
    finalizeDrawing,
    onUpdateLayout,
    releasePointer,
    snappedEndpoints,
  ]);

  const findNearestEndpoint = useCallback(
    (worldPoint: { x: number; y: number }): { ref: EndpointRef; distance: number } | null => {
      if (!layout || !trackSystem) return null;

      let best: { ref: EndpointRef; distance: number } | null = null;

      layout.placedItems.forEach((item) => {
        if (item.trackSystemId !== trackSystem.id) return;
        const geometry = geometryCache.get(item.componentId);
        if (!geometry) return;
        const transform = getItemTransform(item);

        listConnectorEntries(geometry).forEach(({ key, local }) => {
          const connector = transformConnector(local, transform);
          const distance = Math.hypot(connector.xMm - worldPoint.x, connector.yMm - worldPoint.y);
          if (!best || distance < best.distance) {
            best = {
              ref: { itemId: item.id, connectorKey: key },
              distance,
            };
          }
        });
      });

      return best;
    },
    [geometryCache, getItemTransform, layout, trackSystem]
  );

  // Endpoint selection toggles connectors with Shift/Ctrl so users can aim two legs before running Connect.
  // When clicking on a connected endpoint (without shift), automatically select both endpoints for disconnect.
  const updateEndpointSelection = useCallback(
    (endpoint: EndpointRef, additive: boolean) => {
      setSelectedEndpoints((previous) => {
        const exists = previous.some(
          (candidate) =>
            candidate.itemId === endpoint.itemId && candidate.connectorKey === endpoint.connectorKey
        );

        // Check if this endpoint is connected
        const connection = findConnectionForEndpoint(endpoint);

        let next: EndpointRef[];
        if (additive) {
          // Shift-click: toggle endpoint in selection
          if (exists) {
            // Remove this endpoint from selection
            next = previous.filter(
              (entry) =>
                !(entry.itemId === endpoint.itemId && entry.connectorKey === endpoint.connectorKey)
            );
            // If we removed one endpoint of a connection, also remove the other
            if (connection) {
              const otherEndpoint = connection.endpoints.find(
                (ep) =>
                  !(ep.itemId === endpoint.itemId && ep.connectorKey === endpoint.connectorKey)
              );
              if (otherEndpoint) {
                next = next.filter(
                  (entry) =>
                    !(
                      entry.itemId === otherEndpoint.itemId &&
                      entry.connectorKey === otherEndpoint.connectorKey
                    )
                );
              }
            }
          } else {
            // Add this endpoint to selection
            next = [...previous, endpoint];
            // If this endpoint is connected, also add its partner
            if (connection) {
              const otherEndpoint = connection.endpoints.find(
                (ep) =>
                  !(ep.itemId === endpoint.itemId && ep.connectorKey === endpoint.connectorKey)
              );
              if (
                otherEndpoint &&
                !next.some(
                  (ep) =>
                    ep.itemId === otherEndpoint.itemId &&
                    ep.connectorKey === otherEndpoint.connectorKey
                )
              ) {
                next.push(otherEndpoint);
              }
            }
            // Limit to 2 endpoints max
            if (next.length > 2) {
              next = next.slice(next.length - 2);
            }
          }
        } else {
          // Normal click: select this endpoint (and its partner if connected)
          if (connection) {
            // Connected endpoint: select both endpoints for disconnect
            next = [...connection.endpoints];
            setSelectedItemIds(new Set([endpoint.itemId]));
            return next;
          } else {
            // Unconnected endpoint: select just this one
            next = [endpoint];
          }
        }

        const latest = next[next.length - 1] ?? null;
        if (latest) {
          setSelectedItemIds(new Set([latest.itemId]));
        } else {
          setSelectedItemIds(new Set());
        }
        return next;
      });
    },
    [findConnectionForEndpoint]
  );

  const clearSelections = useCallback(() => {
    setSelectedItemIds(new Set());
    setSelectedShapeId(null);
    setSelectedBoardId(null);
    setSelectedEndpoints([]);
    setDimensionSelection([]);
  }, []);

  const startTextEditing = useCallback(
    (shape: CanvasTextShape, isNew = false) => {
      editingTextIsNewRef.current = isNew;
      setEditingTextId(shape.id);
      setEditingTextValue(shape.text);

      setSelectedShapeId(shape.id);
      setSelectedItemIds(new Set());
      setSelectedEndpoints([]);
      setDraggingShapeId(null);
    },
    [setSelectedEndpoints, setSelectedItemIds, setSelectedShapeId, setDraggingShapeId]
  );

  useEffect(() => {
    startTextEditingRef.current = startTextEditing;
  }, [startTextEditing]);

  const finishTextEditing = useCallback(
    (commit: boolean) => {
      if (!editingTextId) return;
      const shapeId = editingTextId;
      const trimmed = editingTextValue.trim();
      const shouldRemove = (commit && !trimmed) || (!commit && editingTextIsNewRef.current);
      if (commit && trimmed) {
        onUpdateLayout((previous) => ({
          ...previous,
          shapes: previous.shapes.map((shape) =>
            shape.id === shapeId ? { ...shape, text: trimmed } : shape
          ),
        }));
      } else if (shouldRemove) {
        onUpdateLayout((previous) => ({
          ...previous,
          shapes: previous.shapes.filter((shape) => shape.id !== shapeId),
        }));
        setSelectedShapeId((previous) => (previous === shapeId ? null : previous));
      }
      editingTextIsNewRef.current = false;
      setEditingTextValue('');
      setEditingTextId(null);
    },
    [editingTextId, editingTextValue, onUpdateLayout, setSelectedShapeId]
  );

  const handleTextInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (
        (event.key === 'Enter' || event.key === 'NumpadEnter') &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        finishTextEditing(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finishTextEditing(false);
      }
    },
    [finishTextEditing]
  );

  useEffect(() => {
    if (!editingTextId) return;
    const handleWindowPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (canvasWrapperRef.current?.contains(target)) {
        return;
      }
      finishTextEditing(true);
    };
    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => window.removeEventListener('pointerdown', handleWindowPointerDown);
  }, [editingTextId, finishTextEditing]);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    // Middle-click: start panning
    if (event.button === 1) {
      event.preventDefault();
      setIsPanning(true);
      capturePointer(event.pointerId);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button !== 0) return;
    const pointerTarget = event.target instanceof Node ? event.target : null;
    if (editingTextId && !textInputRef.current?.contains(pointerTarget)) {
      finishTextEditing(true);
    }

    // Check if click is on an endpoint circle (handled by endpoint circle's onPointerDown)
    const targetElement = event.target instanceof Element ? event.target : null;
    if (targetElement?.tagName === 'circle' && targetElement.closest('g[data-track-item]')) {
      // Endpoint circle click - let the endpoint handler deal with it
      return;
    }

    // Check if clicking on a shape
    const clickedShape = targetElement?.closest('[data-shape]');
    if (clickedShape && !drawingTool) {
      const shapeId = clickedShape.getAttribute('data-shape');
      if (shapeId) {
        event.stopPropagation();
        setSelectedShapeId(shapeId);
        setSelectedBoardId(null);
        setSelectedItemIds(new Set());
        setSelectedEndpoints([]);
        setDimensionSelection([]);
        // Start dragging shape if not in drawing mode. Lines have no center transform;
        // they are select/delete/edit-only in this iteration.
        const worldPoint = clientPointToWorld({ x: event.clientX, y: event.clientY });
        if (worldPoint && layout) {
          const shape = layout.shapes.find((s) => s.id === shapeId);
          if (shape && shape.type !== 'line') {
            setDraggingShapeId(shapeId);
            setDragStartClient({ x: event.clientX, y: event.clientY });
            setDragStartTransform({ x: shape.x, y: shape.y, rotationDeg: shape.rotationDeg });
            setDragPreview({ x: shape.x, y: shape.y, rotationDeg: shape.rotationDeg });
            capturePointer(event.pointerId);
          }
        }
        return;
      }
    }

    // Check if clicking on a base-plane board (its outline) — select + start dragging
    const clickedBoard = targetElement?.closest('[data-board]');
    if (clickedBoard && !drawingTool) {
      const boardId = clickedBoard.getAttribute('data-board');
      if (boardId) {
        event.stopPropagation();
        setSelectedBoardId(boardId);
        setSelectedShapeId(null);
        setSelectedItemIds(new Set());
        setSelectedEndpoints([]);
        setDimensionSelection([]);
        const board = layout?.basePlane?.boards.find((b) => b.id === boardId);
        if (board) {
          boardDragOriginalRef.current = board;
          setDraggingBoardId(boardId);
          setBoardDragDelta({ x: 0, y: 0 });
          setDragStartClient({ x: event.clientX, y: event.clientY });
          capturePointer(event.pointerId);
        }
        return;
      }
    }

    // Fallback: check for nearby endpoints if not clicking on a circle
    // This handles cases where the endpoint circle might not be clickable
    const worldPoint = clientPointToWorld({ x: event.clientX, y: event.clientY });
    if (worldPoint && !drawingTool) {
      const nearest = findNearestEndpoint(worldPoint);
      if (nearest && nearest.distance <= ENDPOINT_CLICK_DISTANCE_MM) {
        const additive = event.shiftKey;
        updateEndpointSelection(nearest.ref, additive);
        return;
      }
    }

    const clickedTrackItem = targetElement?.closest('[data-track-item]') ?? false;
    if (clickedTrackItem && !drawingTool) {
      const trackId = (clickedTrackItem as Element).getAttribute('data-track-item');
      if (trackId) {
        const additive = event.shiftKey;
        if (additive) {
          setDimensionSelection((prev) => {
            const next = prev.includes(trackId) ? prev : [...prev.slice(-1), trackId];
            setSelectedItemIds(new Set([trackId]));
            return next;
          });
        } else {
          setDimensionSelection([trackId]);
          setSelectedItemIds(new Set([trackId]));
        }
      }
      return;
    }

    // If in drawing mode, start drawing
    if (drawingTool && worldPoint) {
      event.preventDefault();
      const snapDistance =
        drawingTool === 'dimension' ? DIMENSION_SNAP_DISTANCE_MM : SKETCH_SNAP_DISTANCE_MM;
      const useSnap =
        drawingTool === 'dimension' ||
        drawingTool === 'line' ||
        drawingTool === 'rectangle' ||
        drawingTool === 'basePlaneRect' ||
        drawingTool === 'basePlanePolygon';
      const snap = useSnap
        ? snapSketchPoint(worldPoint, snapDistance)
        : { x: worldPoint.x, y: worldPoint.y, snapped: false };
      const anchor = { x: snap.x, y: snap.y };

      // Multi-click polygon: each click drops a vertex; clicking the first vertex closes it.
      // Shift = 90° (ortho) corner; a typed length sets the exact segment distance.
      if (drawingTool === 'basePlanePolygon') {
        capturePointer(event.pointerId);
        clearSelections();
        const last = polygonPoints[polygonPoints.length - 1];
        let pt: Vec2 = anchor;
        if (last && event.shiftKey) pt = orthoConstrain(last, pt);
        const numLen = numericEntry ? parseFloat(numericEntry.primary) : NaN;
        if (last && Number.isFinite(numLen) && numLen > 0) {
          let dx = pt.x - last.x;
          let dy = pt.y - last.y;
          const d = Math.hypot(dx, dy) || 1;
          pt = { x: last.x + (dx / d) * numLen, y: last.y + (dy / d) * numLen };
        }
        if (polygonPoints.length >= 3) {
          const first = polygonPoints[0];
          if (Math.hypot(first.x - pt.x, first.y - pt.y) <= POLYGON_CLOSE_DISTANCE_MM) {
            commitPolygon();
            return;
          }
        }
        setPolygonPoints((prev) => [...prev, pt]);
        setDrawCurrent(pt);
        setNumericEntry(null);
        setDrawSnapHit(snap.snapped ? pt : null);
        return;
      }

      setIsDrawing(true);
      setDrawShiftActive(event.shiftKey);
      setDrawStart(anchor);
      setDrawCurrent(anchor);
      setDrawSnapHit(snap.snapped ? anchor : null);
      setNumericEntry(null);
      capturePointer(event.pointerId);
      clearSelections();
      return;
    }

    // Background click: start panning and clear selections
    event.preventDefault();
    setIsPanning(true);
    capturePointer(event.pointerId);
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    clearSelections();
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    // Polygon rubber-band (click-based, so not gated on isDrawing). Shift = 90° corner.
    if (drawingTool === 'basePlanePolygon' && polygonPoints.length > 0) {
      const worldPoint = clientPointToWorld({ x: event.clientX, y: event.clientY });
      if (worldPoint) {
        const snap = snapSketchPoint(worldPoint, SKETCH_SNAP_DISTANCE_MM);
        let pt: Vec2 = { x: snap.x, y: snap.y };
        if (event.shiftKey) pt = orthoConstrain(polygonPoints[polygonPoints.length - 1], pt);
        setDrawCurrent(pt);
        setDrawSnapHit(snap.snapped && !event.shiftKey ? pt : null);
      }
      setDrawShiftActive(event.shiftKey);
      return;
    }

    // Handle drawing
    if (isDrawing && drawStart) {
      const worldPoint = clientPointToWorld({ x: event.clientX, y: event.clientY });
      if (worldPoint) {
        const useSnap =
          drawingTool === 'dimension' ||
          drawingTool === 'line' ||
          drawingTool === 'rectangle' ||
          drawingTool === 'basePlaneRect';
        const snapDistance =
          drawingTool === 'dimension' ? DIMENSION_SNAP_DISTANCE_MM : SKETCH_SNAP_DISTANCE_MM;
        const snap = useSnap
          ? snapSketchPoint(worldPoint, snapDistance)
          : { x: worldPoint.x, y: worldPoint.y, snapped: false };
        setDrawCurrent({ x: snap.x, y: snap.y });
        setDrawSnapHit(snap.snapped ? { x: snap.x, y: snap.y } : null);
      }
      setDrawShiftActive(event.shiftKey);
      return;
    }

    // Handle base-plane board dragging (with edge snapping)
    if (draggingBoardId && dragStartClient && boardDragOriginalRef.current) {
      event.preventDefault();
      const worldDelta = clientDeltaToWorld({
        x: event.clientX - dragStartClient.x,
        y: event.clientY - dragStartClient.y,
      });
      if (!worldDelta) return;
      setBoardDragDelta(snapBoardDelta(boardDragOriginalRef.current, worldDelta.dx, worldDelta.dy));
      return;
    }

    // Handle shape dragging
    if (draggingShapeId && dragStartClient && dragStartTransform) {
      event.preventDefault();
      const delta = {
        x: event.clientX - dragStartClient.x,
        y: event.clientY - dragStartClient.y,
      };
      const worldDelta = clientDeltaToWorld(delta);
      if (!worldDelta) return;

      const nextTransform: DragPreview = {
        x: dragStartTransform.x + worldDelta.dx,
        y: dragStartTransform.y + worldDelta.dy,
        rotationDeg: dragStartTransform.rotationDeg,
      };
      setDragPreview(nextTransform);
      return;
    }

    if (draggingItemId && dragStartClient && dragStartTransform) {
      event.preventDefault();
      const delta = {
        x: event.clientX - dragStartClient.x,
        y: event.clientY - dragStartClient.y,
      };
      const worldDelta = clientDeltaToWorld(delta);
      if (!worldDelta) return;

      const tentative: DragPreview = {
        x: dragStartTransform.x + worldDelta.dx,
        y: dragStartTransform.y + worldDelta.dy,
        rotationDeg: dragStartTransform.rotationDeg,
      };
      const snapped = computeSnappedTransform(draggingItemId, tentative);
      const nextTransform = snapped?.transform ?? tentative;
      setDragPreview(nextTransform);
      setSnappedEndpoints(snapped?.endpoints ?? null);
      const primaryStart = dragGroupStartTransformsRef.current?.[draggingItemId];
      if (primaryStart) {
        setDragGroupDelta({
          x: nextTransform.x - primaryStart.x,
          y: nextTransform.y - primaryStart.y,
        });
      } else {
        setDragGroupDelta(null);
      }
      return;
    }

    if (isPanning) {
      const last = lastPointerRef.current;
      if (!last) {
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        return;
      }

      const delta = {
        x: event.clientX - last.x,
        y: event.clientY - last.y,
      };
      const worldDelta = clientDeltaToWorld(delta);
      if (!worldDelta) return;

      setCamera((prev) => ({
        ...prev,
        x: prev.x - worldDelta.dx,
        y: prev.y - worldDelta.dy,
      }));

      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    }
  };

  const handleWheel = useCallback((event: globalThis.WheelEvent) => {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;

    // Normalize deltaMode: Firefox uses line-mode (1)
    let deltaX = event.deltaX;
    let deltaY = event.deltaY;
    if (event.deltaMode === 1) {
      deltaX *= 20;
      deltaY *= 20;
    }

    if (event.ctrlKey || event.metaKey) {
      // ZOOM toward cursor (pinch-to-zoom / Ctrl+wheel)
      const rect = svg.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const clampedDelta = Math.max(-50, Math.min(50, deltaY));

      setCamera((prev) => {
        const currentViewWidth = VIEWPORT_SIZE / prev.scale;
        const currentViewHeight = VIEWPORT_SIZE / prev.scale;
        const worldX = prev.x + (pointerX / rect.width) * currentViewWidth;
        const worldY = prev.y + (pointerY / rect.height) * currentViewHeight;
        const scaleFactor = Math.exp(-clampedDelta / 100);
        const nextScale = Math.min(4, Math.max(0.35, prev.scale * scaleFactor));
        const nextViewWidth = VIEWPORT_SIZE / nextScale;
        const nextViewHeight = VIEWPORT_SIZE / nextScale;

        return {
          scale: nextScale,
          x: worldX - (pointerX / rect.width) * nextViewWidth,
          y: worldY - (pointerY / rect.height) * nextViewHeight,
        };
      });
    } else {
      // PAN (two-finger scroll / plain wheel)
      const rect = svg.getBoundingClientRect();
      setCamera((prev) => {
        const currentViewWidth = VIEWPORT_SIZE / prev.scale;
        const currentViewHeight = VIEWPORT_SIZE / prev.scale;
        return {
          ...prev,
          x: prev.x + (deltaX / rect.width) * currentViewWidth,
          y: prev.y + (deltaY / rect.height) * currentViewHeight,
        };
      });
    }
  }, []);

  const handleDragOver = (event: DragEvent<SVGSVGElement>) => {
    if (!layout || !trackSystem) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (event: DragEvent<SVGSVGElement>) => {
    if (!layout || !trackSystem) return;
    event.preventDefault();
    const payload = event.dataTransfer.getData('application/json');
    if (!payload) return;

    const data = JSON.parse(payload) as {
      type: string;
      trackSystemId: string;
      componentId: string;
    };
    if (data.type !== 'track-component' || data.trackSystemId !== trackSystem.id) return;

    const worldPoint = clientPointToWorld({ x: event.clientX, y: event.clientY });
    if (!worldPoint) return;

    onUpdateLayout((previous) => ({
      ...previous,
      placedItems: [
        ...previous.placedItems,
        {
          id: generateId(),
          trackSystemId: trackSystem.id,
          componentId: data.componentId,
          x: worldPoint.x,
          y: worldPoint.y,
          rotationDeg: 0,
        },
      ],
    }));
  };

  const handleItemPointerDown = (
    event: ReactPointerEvent<SVGElement>,
    itemId: string,
    initialTransform: DragPreview
  ) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    const groupIds = getConnectedGroupIds(itemId);
    const groupHasGrounded = groupIds.some((id) => isItemGrounded(id));

    const additive = event.shiftKey;
    if (additive) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
    } else {
      if (!selectedItemIds.has(itemId)) {
        setSelectedItemIds(new Set([itemId]));
      }
    }

    setSelectedEndpoints([]);
    if (groupHasGrounded) {
      return;
    }

    capturePointer(event.pointerId);
    setDraggingItemId(itemId);
    setDragStartClient({ x: event.clientX, y: event.clientY });
    setDragStartTransform(initialTransform);
    setDragPreview(initialTransform);
    setDragGroupIds(groupIds);
    setDragGroupDelta({ x: 0, y: 0 });

    const startTransforms: Record<string, DragPreview> = {};
    groupIds.forEach((id) => {
      const groupedItem = itemMap.get(id);
      if (groupedItem) {
        startTransforms[id] = {
          x: groupedItem.x,
          y: groupedItem.y,
          rotationDeg: groupedItem.rotationDeg,
        };
      }
    });
    dragGroupStartTransformsRef.current = startTransforms;
  };

  const computeSnappedTransform = useCallback(
    (
      itemId: string,
      tentative: DragPreview
    ): {
      transform: DragPreview;
      endpoints: { moving: EndpointRef; target: EndpointRef };
    } | null => {
      if (!layout || !trackSystem) return null;
      const item = layout.placedItems.find((placed) => placed.id === itemId);
      if (!item) return null;
      const component = componentMap.get(item.componentId);
      const geometry = component ? geometryCache.get(component.id) : null;
      if (!component || !geometry) return null;

      const movingConnectors = listConnectorEntries(geometry).map(({ key, local }) => ({
        key,
        local,
        world: transformConnector(local, tentative),
      }));

      let bestDistance = Number.POSITIVE_INFINITY;
      let bestTransform: DragPreview | null = null;
      let bestEndpoints: { moving: EndpointRef; target: EndpointRef } | null = null;

      layout.placedItems.forEach((other) => {
        if (other.id === itemId) return;
        if (other.trackSystemId !== trackSystem.id) return;
        const otherComponent = componentMap.get(other.componentId);
        const otherGeometry = otherComponent ? geometryCache.get(other.componentId) : null;
        if (!otherComponent || !otherGeometry) return;

        const otherTransform = { x: other.x, y: other.y, rotationDeg: other.rotationDeg };
        const otherConnectors = listConnectorEntries(otherGeometry).map(({ key, local }) => ({
          key,
          world: transformConnector(local, otherTransform),
        }));

        movingConnectors.forEach(({ key: movingKey, local, world: movingWorld }) => {
          otherConnectors.forEach(({ key: targetKey, world: targetWorld }) => {
            const dx = movingWorld.xMm - targetWorld.xMm;
            const dy = movingWorld.yMm - targetWorld.yMm;
            const distance = Math.hypot(dx, dy);
            if (distance > SNAP_DISTANCE_MM) return;

            const angleDiff = normalizeAngle(
              movingWorld.directionDeg - (targetWorld.directionDeg + 180)
            );
            if (Math.abs(angleDiff) > ANGLE_TOLERANCE_DEG) return;

            // Calculate the rotation needed to align the moving connector with the target
            // desiredDirection is where we want the connector to point in world space
            const desiredDirection = targetWorld.directionDeg + 180;
            // Calculate the delta rotation needed from the current world direction
            const deltaRotation = normalizeAngle(desiredDirection - movingWorld.directionDeg);
            // Apply the delta to the current rotation to get the new rotation
            const rotationDeg = normalizeAngle(tentative.rotationDeg + deltaRotation);
            const rotatedLocal = rotatePointLocal(local.xMm, local.yMm, rotationDeg);

            const newTransform: DragPreview = {
              x: targetWorld.xMm - rotatedLocal.x,
              y: targetWorld.yMm - rotatedLocal.y,
              rotationDeg,
            };

            if (distance < bestDistance) {
              bestDistance = distance;
              bestTransform = newTransform;
              bestEndpoints = {
                moving: { itemId, connectorKey: movingKey },
                target: { itemId: other.id, connectorKey: targetKey },
              };
            }
          });
        });
      });

      if (bestTransform && bestEndpoints) {
        return { transform: bestTransform, endpoints: bestEndpoints };
      }
      return null;
    },
    [componentMap, geometryCache, layout, trackSystem]
  );

  // Rotation is shared between toolbar buttons and the R / Shift+R shortcuts so behaviour stays consistent.
  const rotateSelected = useCallback(
    (deltaDeg: number) => {
      if (!layout) return;

      // Handle shape rotation
      if (selectedShapeId) {
        const currentShape = layout.shapes.find((shape) => shape.id === selectedShapeId);
        if (!currentShape) return;
        if (currentShape.type === 'line') return; // lines are defined by endpoints, not rotation

        const newRotationDeg = normalizeAngle(currentShape.rotationDeg + deltaDeg);

        onUpdateLayout((previous) => ({
          ...previous,
          shapes: previous.shapes.map((shape) =>
            shape.id === selectedShapeId ? { ...shape, rotationDeg: newRotationDeg } : shape
          ),
        }));

        setDragPreview((previous) =>
          previous && draggingShapeId === selectedShapeId
            ? { ...previous, rotationDeg: newRotationDeg }
            : previous
        );
        return;
      }

      // Handle item rotation
      if (selectedItemIds.size === 0) return;

      // For now, only rotate if single item selected or all selected items are safe to rotate
      // TODO: Implement group rotation for multi-selection
      const selectedArray = Array.from(selectedItemIds);

      // Check if any selected item is connected or grounded
      if (selectedArray.some((id) => isItemConnected(id) || isItemGrounded(id))) return;

      onUpdateLayout((previous) => ({
        ...previous,
        placedItems: previous.placedItems.map((item) => {
          if (!selectedItemIds.has(item.id)) return item;

          const newRotationDeg = normalizeAngle(item.rotationDeg + deltaDeg);
          // Rotate around item center for now
          return { ...item, rotationDeg: newRotationDeg };
        }),
      }));

      // Update drag preview if dragging
      if (draggingItemId && selectedItemIds.has(draggingItemId)) {
        setDragPreview((previous) => {
          if (!previous) return previous;
          return { ...previous, rotationDeg: normalizeAngle(previous.rotationDeg + deltaDeg) };
        });
      }
    },
    [
      draggingItemId,
      draggingShapeId,
      layout,
      onUpdateLayout,
      selectedItemIds,
      selectedShapeId,
      isItemConnected,
      isItemGrounded,
    ]
  );

  const deleteSelectedItem = useCallback(() => {
    if (!layout) return;

    // Handle shape deletion
    if (selectedShapeId) {
      onUpdateLayout((previous) => ({
        ...previous,
        shapes: previous.shapes.filter((shape) => shape.id !== selectedShapeId),
      }));
      setSelectedShapeId(null);
      return;
    }

    // Handle base-plane board deletion
    if (selectedBoardId) {
      onUpdateLayout((previous) => {
        if (!previous.basePlane) return previous;
        const boards = previous.basePlane.boards.filter((board) => board.id !== selectedBoardId);
        return {
          ...previous,
          basePlane: boards.length > 0 ? { ...previous.basePlane, boards } : undefined,
        };
      });
      setSelectedBoardId(null);
      return;
    }

    // Handle item deletion
    if (selectedItemIds.size === 0) return;

    const filterConnections = (connections?: EndpointConnection[]) =>
      (connections ?? []).filter((connection) =>
        connection.endpoints.every((endpoint) => !selectedItemIds.has(endpoint.itemId))
      );

    onUpdateLayout((previous) => ({
      ...previous,
      placedItems: previous.placedItems.filter((item) => !selectedItemIds.has(item.id)),
      connections: filterConnections(previous.connections),
    }));
    setSelectedItemIds(new Set());
    setSelectedEndpoints([]);
    setDimensionSelection((prev) => prev.filter((id) => !selectedItemIds.has(id)));
  }, [layout, onUpdateLayout, selectedItemIds, selectedShapeId, selectedBoardId]);

  // Post-edit: set an exact length on a selected line (keeps the start endpoint).
  const setLineLengthMm = useCallback(
    (lineId: string, lengthMm: number) => {
      if (!Number.isFinite(lengthMm) || lengthMm <= 0) return;
      onUpdateLayout((previous) => ({
        ...previous,
        shapes: previous.shapes.map((shape) => {
          if (shape.id !== lineId || shape.type !== 'line') return shape;
          const cur = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1) || 1;
          const ux = (shape.x2 - shape.x1) / cur;
          const uy = (shape.y2 - shape.y1) / cur;
          return { ...shape, x2: shape.x1 + ux * lengthMm, y2: shape.y1 + uy * lengthMm };
        }),
      }));
    },
    [onUpdateLayout]
  );

  // Post-edit: set an exact width/height on a selected rectangular board.
  const setBoardRectSize = useCallback(
    (boardId: string, dim: 'width' | 'height', value: number) => {
      if (!Number.isFinite(value) || value <= 0) return;
      onUpdateLayout((previous) => {
        if (!previous.basePlane) return previous;
        return {
          ...previous,
          basePlane: {
            ...previous.basePlane,
            boards: previous.basePlane.boards.map((board) =>
              board.id === boardId && board.kind === 'rect' ? { ...board, [dim]: value } : board
            ),
          },
        };
      });
    },
    [onUpdateLayout]
  );

  // Connect endpoints reuses the same connector math as snapping: match directions, then translate the moving item.
  const connectSelectedEndpoints = useCallback(() => {
    if (!layout || !trackSystem) return;
    if (selectedEndpoints.length !== 2) return;

    const [firstRef, secondRef] = selectedEndpoints;
    if (firstRef.itemId === secondRef.itemId) return;

    const firstGrounded = isItemGrounded(firstRef.itemId);
    const secondGrounded = isItemGrounded(secondRef.itemId);

    let fixedRef: EndpointRef | undefined;
    let movingRef: EndpointRef | undefined;

    if (firstGrounded && !secondGrounded) {
      fixedRef = firstRef;
      movingRef = secondRef;
    } else if (!firstGrounded && secondGrounded) {
      fixedRef = secondRef;
      movingRef = firstRef;
    } else {
      // Move the smaller connected group into the larger one to avoid ripping apart existing chains.
      const firstGroup = getConnectedGroupIds(firstRef.itemId);
      const secondGroup = getConnectedGroupIds(secondRef.itemId);
      if (firstGroup.length > secondGroup.length) {
        fixedRef = firstRef;
        movingRef = secondRef;
      } else if (secondGroup.length > firstGroup.length) {
        fixedRef = secondRef;
        movingRef = firstRef;
      } else {
        // Tie-breaker: respect explicit user selection or fall back to firstRef.
        const selectedRef =
          selectedEndpoints.find((endpoint) => selectedItemIds.has(endpoint.itemId)) ?? firstRef;
        movingRef = selectedRef;
        fixedRef = selectedRef === firstRef ? secondRef : firstRef;
      }
    }

    if (!fixedRef || !movingRef) return;
    if (movingRef.itemId === fixedRef.itemId) return;
    if (isItemGrounded(movingRef.itemId)) return;

    const fixedItem = layout.placedItems.find((item) => item.id === fixedRef.itemId);
    const movingItem = layout.placedItems.find((item) => item.id === movingRef.itemId);
    if (!fixedItem || !movingItem) return;
    if (fixedItem.trackSystemId !== trackSystem.id || movingItem.trackSystemId !== trackSystem.id)
      return;

    const fixedGeometry = geometryCache.get(fixedItem.componentId);
    const movingGeometry = geometryCache.get(movingItem.componentId);
    if (!fixedGeometry || !movingGeometry) return;

    const fixedConnectorLocal = getConnectorByKey(fixedGeometry, fixedRef.connectorKey);
    const movingConnectorLocal = getConnectorByKey(movingGeometry, movingRef.connectorKey);
    if (!fixedConnectorLocal || !movingConnectorLocal) return;

    if (
      isEndpointConnected(fixedRef.itemId, fixedRef.connectorKey) ||
      isEndpointConnected(movingRef.itemId, movingRef.connectorKey)
    ) {
      return;
    }

    if (Math.abs(fixedConnectorLocal.widthMm - movingConnectorLocal.widthMm) > 1e-3) {
      console.warn('Endpoints are not compatible (width mismatch)', {
        fixed: fixedConnectorLocal.widthMm,
        moving: movingConnectorLocal.widthMm,
      });
      return;
    }

    const transform = computeConnectionTransform(
      fixedItem,
      fixedConnectorLocal,
      movingConnectorLocal
    );
    const newConnection: EndpointConnection = { endpoints: [fixedRef, movingRef] };

    const movingGroupIds = getConnectedGroupIds(movingRef.itemId);
    const deltaRotation = normalizeAngle(transform.rotationDeg - movingItem.rotationDeg);
    const pivotBefore = { x: movingItem.x, y: movingItem.y };
    const pivotAfter = { x: transform.position.x, y: transform.position.y };

    onUpdateLayout((previous) => ({
      ...previous,
      placedItems: previous.placedItems.map((item) => {
        if (!movingGroupIds.includes(item.id)) {
          return item;
        }

        // Rotate+translate the whole moving group around the moving item pivot
        const rel = { x: item.x - pivotBefore.x, y: item.y - pivotBefore.y };
        const rotated = rotatePointLocal(rel.x, rel.y, deltaRotation);
        const x = pivotAfter.x + rotated.x;
        const y = pivotAfter.y + rotated.y;

        return {
          ...item,
          x,
          y,
          rotationDeg: normalizeAngle(item.rotationDeg + deltaRotation),
        };
      }),
      connections: [...(previous.connections ?? []), newConnection],
    }));
  }, [
    getConnectorByKey,
    geometryCache,
    isEndpointConnected,
    isItemGrounded,
    layout,
    onUpdateLayout,
    selectedEndpoints,
    selectedItemIds,
    trackSystem,
  ]);

  const disconnectSelectedEndpoints = useCallback(() => {
    if (!layout || selectedEndpoints.length !== 2) return;
    const connectionIndex = (layout.connections ?? []).findIndex((connection) =>
      connectionMatchesEndpoints(connection, selectedEndpoints)
    );
    if (connectionIndex === -1) return;

    onUpdateLayout((previous) => ({
      ...previous,
      connections: (previous.connections ?? []).filter((_, idx) => idx !== connectionIndex),
    }));
  }, [layout, onUpdateLayout, selectedEndpoints]);

  useImperativeHandle(
    ref,
    () => ({
      connectSelectedEndpoints,
      disconnectSelectedEndpoints,
      rotateSelected,
      deleteSelectedItem,
      addDimensionBetweenSelectedTracks(type: 'center' | 'inner' | 'outer' = 'center') {
        if (!layout || !trackSystem) return false;
        const itemCandidates =
          selectedEndpoints.length === 2
            ? Array.from(new Set(selectedEndpoints.map((ep) => ep.itemId)))
            : selectedItemIds.size === 2
              ? Array.from(selectedItemIds)
              : dimensionSelection.length === 2
                ? dimensionSelection
                : [];
        if (itemCandidates.length !== 2) return false;

        const [firstId, secondId] = itemCandidates;
        const firstItem = layout.placedItems.find((item) => item.id === firstId);
        const secondItem = layout.placedItems.find((item) => item.id === secondId);
        if (!firstItem || !secondItem) return false;
        if (
          firstItem.trackSystemId !== trackSystem.id ||
          secondItem.trackSystemId !== trackSystem.id
        )
          return false;

        const firstGeometry = geometryCache.get(firstItem.componentId);
        const secondGeometry = geometryCache.get(secondItem.componentId);
        if (!firstGeometry || !secondGeometry) return false;

        // Assume standard width from start connector if not available elsewhere
        // Most tracks have constant width
        const firstWidth = firstGeometry.start.widthMm;
        const secondWidth = secondGeometry.start.widthMm;

        const firstInfo = getItemCenterDirection(firstItem);
        const secondInfo = getItemCenterDirection(secondItem);
        if (!firstInfo || !secondInfo) return false;

        const dot = firstInfo.dir.x * secondInfo.dir.x + firstInfo.dir.y * secondInfo.dir.y;
        const angle = Math.acos(clamp(dot, -1, 1)) * (180 / Math.PI);
        const baseDir = angle < 30 || angle > 150 ? firstInfo.dir : firstInfo.dir;
        const normal = { x: -baseDir.y, y: baseDir.x };

        const delta = {
          x: secondInfo.center.x - firstInfo.center.x,
          y: secondInfo.center.y - firstInfo.center.y,
        };
        const distanceSigned = delta.x * normal.x + delta.y * normal.y;
        let distance = Math.abs(distanceSigned);

        // Adjust distance based on type
        if (type === 'inner') {
          distance -= firstWidth / 2 + secondWidth / 2;
        } else if (type === 'outer') {
          distance += firstWidth / 2 + secondWidth / 2;
        }

        if (distance < 1e-3) return false;

        const center = {
          x: firstInfo.center.x + normal.x * (distanceSigned / 2),
          y: firstInfo.center.y + normal.y * (distanceSigned / 2),
        };
        const rotationDeg = normalizeAngle((Math.atan2(normal.y, normal.x) * 180) / Math.PI);

        const newShape: CanvasDimensionShape = {
          id: generateId(),
          type: 'dimension',
          x: center.x,
          y: center.y,
          length: distance,
          rotationDeg,
          offsetMm: DIMENSION_OFFSET_MM,
        };

        onUpdateLayout((previous) => ({
          ...previous,
          shapes: [...previous.shapes, newShape],
        }));
        setSelectedShapeId(newShape.id);
        setSelectedItemIds(new Set());
        return true;
      },
    }),
    [
      connectSelectedEndpoints,
      deleteSelectedItem,
      disconnectSelectedEndpoints,
      rotateSelected,
      layout,
      onUpdateLayout,
      selectedEndpoints,
      trackSystem,
      getItemCenterDirection,
      dimensionSelection,
      selectedItemIds,
    ]
  );

  const undoRef = useRef(undo);
  const redoRef = useRef(redo);

  useEffect(() => {
    undoRef.current = undo;
  }, [undo]);

  useEffect(() => {
    redoRef.current = redo;
  }, [redo]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }

      const isUndoShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === 'z' &&
        !event.shiftKey;
      const isRedoShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === 'z' &&
        event.shiftKey;
      if (isUndoShortcut) {
        event.preventDefault();
        undoRef.current();
        return;
      }
      if (isRedoShortcut) {
        event.preventDefault();
        redoRef.current();
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        if (selectedItemIds.size === 0 && !selectedShapeId) return;
        event.preventDefault();
        rotateSelected(event.shiftKey ? -ROTATION_STEP_DEG : ROTATION_STEP_DEG);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedItemIds.size === 0 && !selectedShapeId && !selectedBoardId) return;
        event.preventDefault();
        deleteSelectedItem();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        clearSelections();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [
    clearSelections,
    deleteSelectedItem,
    rotateSelected,
    selectedItemIds,
    selectedShapeId,
    selectedBoardId,
  ]);

  // CAD-style keyboard while drawing: type an exact dimension, Tab between
  // width/height, Enter commits, Escape cancels. Polygon: Enter closes, Escape cancels.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      const drawingActive =
        isDrawing &&
        (drawingTool === 'line' || drawingTool === 'rectangle' || drawingTool === 'basePlaneRect');
      const polygonActive = drawingTool === 'basePlanePolygon' && polygonPoints.length > 0;

      if (event.key === 'Enter') {
        if (drawingActive) {
          event.preventDefault();
          finalizeDrawing();
        } else if (polygonActive) {
          event.preventDefault();
          const numLen = numericEntry ? parseFloat(numericEntry.primary) : NaN;
          if (Number.isFinite(numLen) && numLen > 0) addPolygonVertexAtLength(numLen);
          else commitPolygon();
        }
        return;
      }
      if (event.key === 'Escape') {
        if (drawingActive) {
          event.preventDefault();
          setIsDrawing(false);
          setDrawStart(null);
          setDrawCurrent(null);
          setNumericEntry(null);
          setDrawSnapHit(null);
        } else if (polygonActive) {
          event.preventDefault();
          setPolygonPoints([]);
          setDrawCurrent(null);
          setDrawSnapHit(null);
        }
        return;
      }
      if (!drawingActive && !polygonActive) return;

      const twoFields = drawingTool === 'rectangle' || drawingTool === 'basePlaneRect';
      if (event.key === 'Tab' && twoFields) {
        event.preventDefault();
        setNumericEntry((prev) => {
          const base = prev ?? { primary: '', secondary: '', field: 'primary' as const };
          return { ...base, field: base.field === 'primary' ? 'secondary' : 'primary' };
        });
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        setNumericEntry((prev) =>
          prev ? { ...prev, [prev.field]: prev[prev.field].slice(0, -1) } : prev
        );
        return;
      }
      if (/^[0-9.]$/.test(event.key)) {
        event.preventDefault();
        setNumericEntry((prev) => {
          const base = prev ?? { primary: '', secondary: '', field: 'primary' as const };
          const current = base[base.field];
          if (event.key === '.' && current.includes('.')) return base;
          return { ...base, [base.field]: current + event.key };
        });
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isDrawing,
    drawingTool,
    polygonPoints,
    numericEntry,
    finalizeDrawing,
    commitPolygon,
    addPolygonVertexAtLength,
  ]);

  // Native non-passive wheel listener (React onWheel is passive, can't preventDefault)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Prevent browser middle-click auto-scroll cursor
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const preventMiddleClick = (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    };
    svg.addEventListener('mousedown', preventMiddleClick);
    return () => svg.removeEventListener('mousedown', preventMiddleClick);
  }, []);

  if (!layout || !trackSystem) {
    return (
      <div className="canvas-container flex flex-1 items-center justify-center bg-slate-900 text-sm text-slate-300">
        No active project selected
      </div>
    );
  }

  const selectedLineShape =
    selectedShapeId != null
      ? (layout.shapes.find((s) => s.id === selectedShapeId && s.type === 'line') as
          | CanvasLineShape
          | undefined)
      : undefined;
  const selectedRectBoard =
    selectedBoardId != null
      ? layout.basePlane?.boards.find(
          (b): b is Extract<BasePlaneBoard, { kind: 'rect' }> =>
            b.id === selectedBoardId && b.kind === 'rect'
        )
      : undefined;

  return (
    <div className="canvas-container flex flex-1 flex-col bg-slate-900">
      <div
        ref={canvasWrapperRef}
        className="canvas-wrapper relative flex h-full w-full overflow-hidden bg-slate-950 shadow-inner"
      >
        <svg
          ref={svgRef}
          className="h-full w-full touch-none select-none"
          viewBox={`${camera.x} ${camera.y} ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label="Track layout canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onAuxClick={(e) => e.preventDefault()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M40 0H0V40"
                fill="none"
                stroke="#94a3b8"
                strokeOpacity="0.15"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect
            x={camera.x - viewWidth}
            y={camera.y - viewHeight}
            width={viewWidth * 3}
            height={viewHeight * 3}
            fill="url(#grid)"
          />

          {/* Base-plane boards (the benchwork tracks sit on) */}
          {layout.basePlane?.boards.map((board) => {
            const selected = selectedBoardId === board.id;
            const live =
              draggingBoardId === board.id && boardDragDelta
                ? translateBoard(board, boardDragDelta.x, boardDragDelta.y)
                : board;
            const d = boardPathD(live);
            return (
              <g key={board.id}>
                {/* Filled body is grabbable anywhere so the whole board can be dragged */}
                <path
                  data-board={board.id}
                  d={d}
                  fill={selected ? 'rgba(96, 165, 250, 0.16)' : 'rgba(96, 165, 250, 0.07)'}
                  stroke={selected ? '#93c5fd' : '#3b82f6'}
                  strokeWidth={selected ? 3 : 2}
                  strokeDasharray="14 8"
                  style={{ cursor: 'move' }}
                />
              </g>
            );
          })}

          {layout.placedItems.map((item) => {
            const component = componentMap.get(item.componentId);
            const geometry = component ? geometryCache.get(component.id) : null;
            if (!component || !geometry) return null;
            return (
              <TrackItemRenderer
                key={item.id}
                item={item}
                component={component}
                pathD={geometry.buildPathD()}
                connectorEntries={listConnectorEntries(geometry)}
                transform={getItemTransform(item)}
                isSelected={selectedItemIds.has(item.id)}
                showColors={showColors}
                debugMode={debugMode}
                selectedEndpoints={selectedEndpoints}
                isEndpointConnected={isEndpointConnected}
                onItemPointerDown={handleItemPointerDown}
                onEndpointPointerDown={(endpoint, additive) =>
                  updateEndpointSelection(endpoint, additive)
                }
              />
            );
          })}

          {/* Render shapes */}
          {layout.shapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              isSelected={selectedShapeId === shape.id}
              isDragging={draggingShapeId === shape.id}
              dragPreview={dragPreview}
              editingTextId={editingTextId}
              editingTextValue={editingTextValue}
              textInputRef={textInputRef}
              onTextInput={setEditingTextValue}
              onTextKeyDown={handleTextInputKeyDown}
              onTextBlur={() => finishTextEditing(true)}
              onTextDoubleClick={(textShape) => startTextEditing(textShape, false)}
            />
          ))}

          {/* Off-board warning rings for tracks outside the base plane */}
          {offBoardItemIds.size > 0 &&
            layout.placedItems.map((item) => {
              if (!offBoardItemIds.has(item.id)) return null;
              const t = getItemTransform(item);
              return (
                <circle
                  key={`offboard-${item.id}`}
                  cx={t.x}
                  cy={t.y}
                  r={22}
                  fill="none"
                  stroke="#f87171"
                  strokeWidth={3}
                  strokeDasharray="7 5"
                  pointerEvents="none"
                />
              );
            })}

          {/* In-progress base-plane polygon */}
          {drawingTool === 'basePlanePolygon' && polygonPoints.length > 0 && (
            <g pointerEvents="none">
              <polyline
                points={[...polygonPoints, ...(drawCurrent ? [drawCurrent] : [])]
                  .map((p) => `${p.x},${p.y}`)
                  .join(' ')}
                fill="rgba(96, 165, 250, 0.07)"
                stroke="#60a5fa"
                strokeWidth={2}
                strokeDasharray="8 6"
                strokeLinejoin="round"
              />
              {polygonPoints.map((p, i) => (
                <circle
                  key={`poly-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={i === 0 ? 6 : 4}
                  fill={i === 0 ? '#bfdbfe' : '#60a5fa'}
                  stroke="#1e3a8a"
                  strokeWidth={1}
                />
              ))}
              {drawCurrent &&
                (() => {
                  const last = polygonPoints[polygonPoints.length - 1];
                  const len = Math.hypot(drawCurrent.x - last.x, drawCurrent.y - last.y);
                  if (len < 0.5) return null;
                  return (
                    <text
                      x={(last.x + drawCurrent.x) / 2}
                      y={(last.y + drawCurrent.y) / 2 - 6}
                      textAnchor="middle"
                      fontSize={8}
                      className="fill-slate-100"
                    >
                      {`${len.toFixed(1)} mm`}
                    </text>
                  );
                })()}
            </g>
          )}

          {/* Render drawing preview */}
          {isDrawing && drawStart && drawCurrent && drawingTool && (
            <DrawingPreview
              drawingTool={drawingTool}
              drawStart={drawStart}
              drawCurrent={drawCurrent}
              drawShiftActive={drawShiftActive}
            />
          )}

          {/* Snap indicator */}
          {drawSnapHit && (
            <g pointerEvents="none">
              <circle
                cx={drawSnapHit.x}
                cy={drawSnapHit.y}
                r={6}
                fill="none"
                stroke="#fbbf24"
                strokeWidth={2}
              />
              <circle cx={drawSnapHit.x} cy={drawSnapHit.y} r={1.5} fill="#fbbf24" />
            </g>
          )}
        </svg>

        {/* CAD numeric-entry / hint HUD */}
        {isDrawing &&
          (drawingTool === 'line' ||
            drawingTool === 'rectangle' ||
            drawingTool === 'basePlaneRect') && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-blue-500/60 bg-slate-900/90 px-3 py-1 text-xs text-slate-100">
              {drawingTool === 'line' ? (
                <span>
                  Length:{' '}
                  <span className="font-semibold text-blue-200">
                    {numericEntry?.primary || '—'}
                  </span>{' '}
                  mm
                </span>
              ) : (
                <span>
                  W:{' '}
                  <span
                    className={
                      numericEntry?.field === 'primary'
                        ? 'font-semibold text-blue-200 underline'
                        : 'font-semibold text-blue-200'
                    }
                  >
                    {numericEntry?.primary || '—'}
                  </span>{' '}
                  H:{' '}
                  <span
                    className={
                      numericEntry?.field === 'secondary'
                        ? 'font-semibold text-blue-200 underline'
                        : 'font-semibold text-blue-200'
                    }
                  >
                    {numericEntry?.secondary || '—'}
                  </span>{' '}
                  mm
                </span>
              )}
              <span className="ml-2 text-slate-400">type a size · Enter commits · Esc cancels</span>
            </div>
          )}

        {drawingTool === 'basePlanePolygon' && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-blue-500/60 bg-slate-900/90 px-3 py-1 text-xs text-slate-100">
            {polygonPoints.length > 0 && numericEntry?.primary ? (
              <span className="mr-2">
                Segment: <span className="font-semibold text-blue-200">{numericEntry.primary}</span>{' '}
                mm · Enter places ·
              </span>
            ) : null}
            Base-plane outline · click to add points · Shift = 90° · type a length · click first
            point / Enter to close · Esc cancels
          </div>
        )}

        {/* Post-edit: exact dimensions for a selected line */}
        {selectedLineShape && !drawingTool && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded border border-blue-500/60 bg-slate-900/90 px-3 py-1 text-xs text-slate-100">
            <span className="text-slate-400">Line length</span>
            <input
              key={selectedLineShape.id}
              type="number"
              step="0.1"
              min="0"
              defaultValue={lineLength(selectedLineShape).toFixed(1)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setLineLengthMm(selectedLineShape.id, parseFloat(event.currentTarget.value));
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) =>
                setLineLengthMm(selectedLineShape.id, parseFloat(event.currentTarget.value))
              }
              className="w-20 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-100"
            />
            <span className="text-slate-400">mm</span>
          </div>
        )}

        {/* Post-edit: exact width/height for a selected rectangular board */}
        {selectedRectBoard && !drawingTool && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded border border-blue-500/60 bg-slate-900/90 px-3 py-1 text-xs text-slate-100">
            <span className="text-slate-400">Board</span>
            <span>W</span>
            <input
              key={`${selectedRectBoard.id}-w`}
              type="number"
              step="1"
              min="0"
              defaultValue={selectedRectBoard.width.toFixed(1)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setBoardRectSize(
                    selectedRectBoard.id,
                    'width',
                    parseFloat(event.currentTarget.value)
                  );
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) =>
                setBoardRectSize(
                  selectedRectBoard.id,
                  'width',
                  parseFloat(event.currentTarget.value)
                )
              }
              className="w-20 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-100"
            />
            <span>H</span>
            <input
              key={`${selectedRectBoard.id}-h`}
              type="number"
              step="1"
              min="0"
              defaultValue={selectedRectBoard.height.toFixed(1)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setBoardRectSize(
                    selectedRectBoard.id,
                    'height',
                    parseFloat(event.currentTarget.value)
                  );
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) =>
                setBoardRectSize(
                  selectedRectBoard.id,
                  'height',
                  parseFloat(event.currentTarget.value)
                )
              }
              className="w-20 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-100"
            />
            <span className="text-slate-400">mm</span>
          </div>
        )}
      </div>
    </div>
  );
});

Canvas.displayName = 'Canvas';
