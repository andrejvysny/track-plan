import * as THREE from 'three';
import type { LayoutState } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';
import { toRad } from '../../../geometry/geometryUtils';
import { getCachedTrackGeometry } from '../../../geometry/trackGeometryCache3D';
import { curveElevationEndpoints } from '../../../geometry/trackGeometry3D';
import { boardVertices } from '../../../utils/shapeGeometry';

export interface SceneBounds3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cy: number;
  cz: number;
  sizeXZ: number;
  diagonal: number;
}

const MIN_SCENE_SIZE = 1000;
const RAIL_RADIUS_MM = 1.5;
const BOUNDS_PADDING_XZ = 320;
const BOUNDS_PADDING_Y = 80;

function emptyBounds(): SceneBounds3D {
  const sizeXZ = MIN_SCENE_SIZE;
  return {
    minX: -sizeXZ / 2,
    maxX: sizeXZ / 2,
    minY: -BOUNDS_PADDING_Y,
    maxY: BOUNDS_PADDING_Y,
    minZ: -sizeXZ / 2,
    maxZ: sizeXZ / 2,
    cx: 0,
    cy: 0,
    cz: 0,
    sizeXZ,
    diagonal: Math.hypot(sizeXZ, sizeXZ),
  };
}

interface RawBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function createRawBounds(): RawBounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
}

function includePoint(bounds: RawBounds, x: number, y: number, z: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxY = Math.max(bounds.maxY, y);
  bounds.minZ = Math.min(bounds.minZ, z);
  bounds.maxZ = Math.max(bounds.maxZ, z);
}

function curvePoints(curve: THREE.Curve<THREE.Vector3>): THREE.Vector3[] {
  if (curve instanceof THREE.LineCurve3) {
    return [curve.v1, curve.v2];
  }
  if (curve instanceof THREE.CatmullRomCurve3) {
    return curve.points;
  }
  return curve.getPoints(16);
}

export function computeSceneBounds(
  layout: LayoutState | null,
  componentMap: Map<string, TrackComponentDefinition>
): SceneBounds3D {
  const boards = layout?.basePlane?.boards ?? [];
  if (!layout || (layout.placedItems.length === 0 && boards.length === 0)) {
    return emptyBounds();
  }

  const raw = createRawBounds();
  const yAxis = new THREE.Vector3(0, 1, 0);

  for (const item of layout.placedItems) {
    const def = componentMap.get(item.componentId);
    if (!def) {
      continue;
    }

    const cached = getCachedTrackGeometry(def);
    const rotRad = -toRad(item.rotationDeg);

    for (const curve of cached.curves) {
      const { startMm, endMm } = curveElevationEndpoints(curve, item.connectorElevationsMm);
      const leftPoints = curvePoints(curve.leftRail);
      const rightPoints = curvePoints(curve.rightRail);
      for (const railPoints of [leftPoints, rightPoints]) {
        const pointsCount = railPoints.length;
        for (let i = 0; i < pointsCount; i++) {
          const point = railPoints[i];
          const t = pointsCount > 1 ? i / (pointsCount - 1) : 0;
          const yElev = startMm + t * (endMm - startMm);
          const world = point.clone().applyAxisAngle(yAxis, rotRad);
          world.x += item.x;
          world.z += item.y;
          world.y = yElev;

          includePoint(raw, world.x, world.y - RAIL_RADIUS_MM, world.z);
          includePoint(raw, world.x, world.y + RAIL_RADIUS_MM, world.z);
        }
      }
    }
  }

  // Base-plane boards: SVG (x, y) maps to world (x, z); include their footprint.
  for (const board of boards) {
    for (const vertex of boardVertices(board)) {
      includePoint(raw, vertex.x, 0, vertex.y);
    }
  }

  if (!Number.isFinite(raw.minX)) {
    return emptyBounds();
  }

  const minX = raw.minX - BOUNDS_PADDING_XZ;
  const maxX = raw.maxX + BOUNDS_PADDING_XZ;
  const minZ = raw.minZ - BOUNDS_PADDING_XZ;
  const maxZ = raw.maxZ + BOUNDS_PADDING_XZ;
  const minY = raw.minY - BOUNDS_PADDING_Y;
  const maxY = raw.maxY + BOUNDS_PADDING_Y;

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const sizeXZ = Math.max(spanX, spanZ, MIN_SCENE_SIZE);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    cx,
    cy,
    cz,
    sizeXZ,
    diagonal: Math.hypot(spanX, spanZ),
  };
}
