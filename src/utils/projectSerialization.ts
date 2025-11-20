import type { Project } from '../types/project'
import type {
  CanvasDimensionShape,
  CanvasPrimitiveShape,
  CanvasShape,
  CanvasTextShape,
  EndpointConnection,
  LayoutState,
  PlacedItem,
} from '../types/layout'
import type {
  EndpointRef,
  TrackComponentDefinition,
  TrackComponentType,
  TrackSystemDefinition,
} from '../types/trackSystem'
import { cloneLayoutState } from './cloneLayout'

const EXPORT_VERSION = 1

const TRACK_COMPONENT_TYPES: TrackComponentType[] = ['straight', 'curve', 'switch', 'other']

export type ProjectExportPayload = {
  version: number
  project: Project
}

export type ProjectImportData = {
  name: string
  layout: LayoutState
  createdAt?: string
  updatedAt?: string
}

export function buildProjectExport(project: Project): string {
  const payload: ProjectExportPayload = {
    version: EXPORT_VERSION,
    project: {
      ...project,
      layout: cloneLayoutState(project.layout),
    },
  }

  return JSON.stringify(payload, null, 2)
}

export function parseProjectImport(json: string): { ok: true; project: ProjectImportData } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    return { ok: false, error: 'File is not valid JSON.' }
  }

  const payload = parsed as Partial<ProjectExportPayload> | unknown
  const version = typeof (payload as ProjectExportPayload)?.version === 'number' ? (payload as ProjectExportPayload).version : null

  if (version !== null && version !== EXPORT_VERSION) {
    return { ok: false, error: `Unsupported export version ${version}.` }
  }

  const rawProject = (payload as ProjectExportPayload).project ?? parsed
  const validatedProject = validateProject(rawProject)

  if (!validatedProject.ok) {
    return { ok: false, error: validatedProject.error }
  }

  return { ok: true, project: validatedProject.project }
}

function validateProject(candidate: unknown): { ok: true; project: ProjectImportData } | { ok: false; error: string } {
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, error: 'Project payload is missing.' }
  }

  const raw = candidate as Partial<Project>
  const name = typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : 'Imported Project'
  const layoutResult = validateLayout((raw as Project).layout)

  if (!layoutResult.ok) {
    return { ok: false, error: layoutResult.error }
  }

  const createdAt = typeof raw.createdAt === 'string' && isValidIsoDate(raw.createdAt) ? raw.createdAt : undefined
  const updatedAt = typeof raw.updatedAt === 'string' && isValidIsoDate(raw.updatedAt) ? raw.updatedAt : undefined

  return {
    ok: true,
    project: {
      name,
      layout: layoutResult.layout,
      createdAt,
      updatedAt,
    },
  }
}

function validateLayout(candidate: unknown): { ok: true; layout: LayoutState } | { ok: false; error: string } {
  if (!candidate || typeof candidate !== 'object') {
    return { ok: false, error: 'Layout is missing from the file.' }
  }

  const raw = candidate as Partial<LayoutState>

  const trackSystems: TrackSystemDefinition[] = Array.isArray(raw.trackSystems)
    ? raw.trackSystems
      .map(validateTrackSystem)
      .filter((system): system is TrackSystemDefinition => Boolean(system))
    : []

  if (trackSystems.length === 0) {
    return { ok: false, error: 'No track systems found in the import.' }
  }

  const trackSystemComponentMap = new Map<string, Set<string>>(
    trackSystems.map((system) => [system.id, new Set(system.components.map((component) => component.id))]),
  )

  const placedItems: PlacedItem[] = Array.isArray(raw.placedItems)
    ? raw.placedItems
      .map(validatePlacedItem)
      .filter((item): item is PlacedItem => Boolean(item))
    : []

  const hasDanglingItems = placedItems.some((item) => {
    const systemComponents = trackSystemComponentMap.get(item.trackSystemId)
    return !systemComponents || !systemComponents.has(item.componentId)
  })

  if (hasDanglingItems) {
    return { ok: false, error: 'Placed items reference missing track systems or components.' }
  }

  const placedItemIds = new Set(placedItems.map((item) => item.id))

  const connections: EndpointConnection[] = Array.isArray(raw.connections)
    ? raw.connections
      .map(validateConnection)
      .filter(
        (connection): connection is EndpointConnection =>
          Boolean(connection && connection.endpoints.every((endpoint) => placedItemIds.has(endpoint.itemId))),
      )
    : []

  const shapes: CanvasShape[] = Array.isArray(raw.shapes)
    ? raw.shapes
      .map(validateShape)
      .filter((shape): shape is CanvasShape => Boolean(shape))
    : []

  const activeTrackSystemId =
    typeof raw.activeTrackSystemId === 'string' && trackSystems.some((system) => system.id === raw.activeTrackSystemId)
      ? raw.activeTrackSystemId
      : trackSystems[0]?.id ?? null

  const layout: LayoutState = {
    activeTrackSystemId,
    trackSystems,
    placedItems,
    connections,
    shapes,
  }

  return { ok: true, layout }
}

function validateTrackSystem(candidate: unknown): TrackSystemDefinition | null {
  if (!candidate || typeof candidate !== 'object') return null
  const raw = candidate as TrackSystemDefinition

  if (!isString(raw.id) || !isString(raw.name) || !isString(raw.scale)) return null
  if (!isFiniteNumber(raw.ratio) || !isFiniteNumber(raw.gaugeMm) || !isFiniteNumber(raw.parallelSpacingMm) || !isFiniteNumber(raw.moduleLengthMm)) return null
  if (!Array.isArray(raw.components)) return null

  const components = raw.components
    .map(validateTrackComponent)
    .filter((component): component is TrackComponentDefinition => Boolean(component))

  if (components.length === 0) return null

  return {
    id: raw.id,
    name: raw.name,
    scale: raw.scale,
    ratio: raw.ratio,
    gaugeMm: raw.gaugeMm,
    parallelSpacingMm: raw.parallelSpacingMm,
    moduleLengthMm: raw.moduleLengthMm,
    components,
  }
}

function validateTrackComponent(candidate: unknown): TrackComponentDefinition | null {
  if (!candidate || typeof candidate !== 'object') return null
  const raw = candidate as TrackComponentDefinition

  if (!isString(raw.id) || !isString(raw.label) || !isTrackComponentType(raw.type)) return null

  const component: TrackComponentDefinition = {
    id: raw.id,
    label: raw.label,
    type: raw.type,
  }

  if (isFiniteNumber(raw.lengthMm)) component.lengthMm = raw.lengthMm
  if (isFiniteNumber(raw.radiusMm)) component.radiusMm = raw.radiusMm
  if (isFiniteNumber(raw.angleDeg)) component.angleDeg = raw.angleDeg
  if (typeof raw.clockwise === 'boolean') component.clockwise = raw.clockwise
  if (isString(raw.article)) component.article = raw.article
  if (raw.meta && typeof raw.meta === 'object') component.meta = raw.meta as Record<string, unknown>

  return component
}

function validatePlacedItem(candidate: unknown): PlacedItem | null {
  if (!candidate || typeof candidate !== 'object') return null
  const raw = candidate as PlacedItem

  if (!isString(raw.id) || !isString(raw.trackSystemId) || !isString(raw.componentId)) return null
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y) || !isFiniteNumber(raw.rotationDeg)) return null

  return {
    id: raw.id,
    trackSystemId: raw.trackSystemId,
    componentId: raw.componentId,
    x: raw.x,
    y: raw.y,
    rotationDeg: raw.rotationDeg,
    isGrounded: typeof raw.isGrounded === 'boolean' ? raw.isGrounded : undefined,
  }
}

function validateConnection(candidate: unknown): EndpointConnection | null {
  if (!candidate || typeof candidate !== 'object') return null
  const raw = candidate as EndpointConnection

  if (!Array.isArray(raw.endpoints) || raw.endpoints.length !== 2) return null
  const endpoints = raw.endpoints
    .map(validateEndpointRef)
    .filter((endpoint): endpoint is EndpointRef => Boolean(endpoint)) as [EndpointRef, EndpointRef]

  if (endpoints.length !== 2) return null

  return { endpoints }
}

function validateEndpointRef(candidate: unknown): EndpointRef | null {
  if (!candidate || typeof candidate !== 'object') return null
  const raw = candidate as EndpointRef
  if (!isString(raw.itemId) || !isString(raw.connectorKey)) return null
  return { itemId: raw.itemId, connectorKey: raw.connectorKey }
}

function validateShape(candidate: unknown): CanvasShape | null {
  if (!candidate || typeof candidate !== 'object') return null
  const raw = candidate as CanvasShape
  if (!isString((raw as CanvasShape).type) || !isString((raw as CanvasShape).id)) return null

  switch ((raw as CanvasShape).type) {
    case 'rectangle': {
      const rect = raw as CanvasPrimitiveShape
      if (
        !isFiniteNumber(rect.x) ||
        !isFiniteNumber(rect.y) ||
        !isFiniteNumber(rect.width) ||
        !isFiniteNumber(rect.height) ||
        !isFiniteNumber(rect.rotationDeg)
      ) {
        return null
      }
      return {
        id: rect.id,
        type: 'rectangle',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        rotationDeg: rect.rotationDeg,
      }
    }
    case 'circle': {
      const circle = raw as CanvasPrimitiveShape
      if (!isFiniteNumber(circle.x) || !isFiniteNumber(circle.y) || !isFiniteNumber(circle.width) || !isFiniteNumber(circle.rotationDeg)) {
        return null
      }
      return {
        id: circle.id,
        type: 'circle',
        x: circle.x,
        y: circle.y,
        width: circle.width,
        rotationDeg: circle.rotationDeg,
      }
    }
    case 'text': {
      const text = raw as CanvasTextShape
      if (
        !isFiniteNumber(text.x) ||
        !isFiniteNumber(text.y) ||
        !isFiniteNumber(text.fontSize) ||
        !isFiniteNumber(text.width) ||
        !isFiniteNumber(text.height) ||
        !isFiniteNumber(text.rotationDeg) ||
        !isString(text.text)
      ) {
        return null
      }
      return {
        id: text.id,
        type: 'text',
        x: text.x,
        y: text.y,
        text: text.text,
        fontSize: text.fontSize,
        width: text.width,
        height: text.height,
        rotationDeg: text.rotationDeg,
      }
    }
    case 'dimension': {
      const dimension = raw as CanvasDimensionShape
      if (
        !isFiniteNumber(dimension.x) ||
        !isFiniteNumber(dimension.y) ||
        !isFiniteNumber(dimension.length) ||
        !isFiniteNumber(dimension.rotationDeg) ||
        !isFiniteNumber(dimension.offsetMm)
      ) {
        return null
      }
      return {
        id: dimension.id,
        type: 'dimension',
        x: dimension.x,
        y: dimension.y,
        length: dimension.length,
        rotationDeg: dimension.rotationDeg,
        offsetMm: dimension.offsetMm,
        label: isString(dimension.label) ? dimension.label : undefined,
      }
    }
    default:
      return null
  }
}

function isTrackComponentType(value: unknown): value is TrackComponentType {
  return typeof value === 'string' && TRACK_COMPONENT_TYPES.includes(value as TrackComponentType)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidIsoDate(candidate: string): boolean {
  return !Number.isNaN(Date.parse(candidate))
}
