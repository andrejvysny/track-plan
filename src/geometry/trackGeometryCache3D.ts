import * as THREE from 'three';
import type { TrackComponentDefinition } from '../types/trackSystem';
import {
  getTrackCurves3D,
  RAIL_RADIUS_MM,
  TIE_SPACING_MM,
  type TrackCurve3D,
} from './trackGeometry3D';

export interface CachedTrackGeometry {
  railGeometries: THREE.TubeGeometry[];
  tiePositions: {
    position: THREE.Vector3;
    rotationY: number;
    t: number;
    startConnectorKey: string | null;
    endConnectorKey: string | null;
  }[];
  curves: TrackCurve3D[];
}

const cache = new Map<string, CachedTrackGeometry>();

function buildCacheKey(def: TrackComponentDefinition): string {
  return JSON.stringify({
    id: def.id,
    type: def.type,
    lengthMm: def.lengthMm ?? null,
    radiusMm: def.radiusMm ?? null,
    angleDeg: def.angleDeg ?? null,
    clockwise: def.clockwise ?? null,
    meta: def.meta ?? null,
  });
}

export function getCachedTrackGeometry(def: TrackComponentDefinition): CachedTrackGeometry {
  const cacheKey = buildCacheKey(def);
  const existing = cache.get(cacheKey);
  if (existing) return existing;

  const curves = getTrackCurves3D(def);
  const railGeometries: THREE.TubeGeometry[] = [];
  const tiePositions: {
    position: THREE.Vector3;
    rotationY: number;
    t: number;
    startConnectorKey: string | null;
    endConnectorKey: string | null;
  }[] = [];

  for (const curve of curves) {
    const tubularSegments = Math.max(8, Math.ceil(curve.lengthMm / 5));
    railGeometries.push(
      new THREE.TubeGeometry(curve.leftRail, tubularSegments, RAIL_RADIUS_MM, 6, false),
      new THREE.TubeGeometry(curve.rightRail, tubularSegments, RAIL_RADIUS_MM, 6, false)
    );

    const numTies = Math.max(1, Math.floor(curve.lengthMm / TIE_SPACING_MM));
    for (let i = 0; i <= numTies; i++) {
      const t = i / numTies;
      const point = curve.centerline.getPoint(t);
      const tangent = curve.centerline.getTangent(t);
      const previous = tiePositions[tiePositions.length - 1];
      if (previous && previous.position.distanceToSquared(point) < 1e-4) {
        continue;
      }
      tiePositions.push({
        position: point,
        rotationY: Math.atan2(tangent.x, tangent.z),
        t,
        startConnectorKey: curve.startConnectorKey,
        endConnectorKey: curve.endConnectorKey,
      });
    }
  }

  const entry: CachedTrackGeometry = { railGeometries, tiePositions, curves };
  cache.set(cacheKey, entry);
  return entry;
}

export function clearTrackGeometryCache(): void {
  for (const entry of cache.values()) {
    for (const geo of entry.railGeometries) {
      geo.dispose();
    }
  }
  cache.clear();
}
