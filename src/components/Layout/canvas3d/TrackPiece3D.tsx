import { useMemo, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import type { PlacedItem } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';
import { getCachedTrackGeometry } from '../../../geometry/trackGeometryCache3D';
import { applyElevationToCurves } from '../../../geometry/trackGeometry3D';
import { toRad } from '../../../geometry/geometryUtils';

// Shared materials (created once)
const railMaterial = new THREE.MeshStandardMaterial({
  color: 0x888888,
  metalness: 0.8,
  roughness: 0.35,
});

const selectedRailMaterial = new THREE.MeshStandardMaterial({
  color: 0x8f98a3,
  metalness: 0.8,
  roughness: 0.3,
  emissive: 0x0ea5e9,
  emissiveIntensity: 0.55,
});

const RAIL_RADIUS_MM = 1.5;

interface TrackPiece3DProps {
  item: PlacedItem;
  componentDef: TrackComponentDefinition;
  isSelected?: boolean;
  onClick?: (itemId: string) => void;
}

export function TrackPiece3D({ item, componentDef, isSelected, onClick }: TrackPiece3DProps) {
  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onClick?.(item.id);
    },
    [item.id, onClick]
  );

  const railResult = useMemo(() => {
    const cached = getCachedTrackGeometry(componentDef);
    const connectorElevationsMm = item.connectorElevationsMm;
    const hasElevation =
      connectorElevationsMm !== undefined &&
      Object.values(connectorElevationsMm).some((value) => Math.abs(value) > 1e-6);

    if (!hasElevation) {
      return { geometries: cached.railGeometries, generated: false };
    }

    const elevated = applyElevationToCurves(cached.curves, connectorElevationsMm);
    const geometries = elevated
      .map((curve) => {
        const tubularSegments = Math.max(8, Math.ceil(curve.lengthMm / 5));
        return [
          new THREE.TubeGeometry(curve.leftRail, tubularSegments, RAIL_RADIUS_MM, 6, false),
          new THREE.TubeGeometry(curve.rightRail, tubularSegments, RAIL_RADIUS_MM, 6, false),
        ];
      })
      .flat();

    return { geometries, generated: true };
  }, [componentDef, item.connectorElevationsMm]);

  useEffect(() => {
    return () => {
      if (!railResult.generated) {
        return;
      }
      for (const geometry of railResult.geometries) {
        geometry.dispose();
      }
    };
  }, [railResult]);

  const gradeInfo = useMemo(() => {
    if (!isSelected) return [];
    const connectorElevationsMm = item.connectorElevationsMm;
    if (!connectorElevationsMm || Object.keys(connectorElevationsMm).length === 0) {
      return [];
    }

    const cached = getCachedTrackGeometry(componentDef);
    const seen = new Set<string>();
    const result: { key: string; grade: number; midY: number }[] = [];

    for (const curve of cached.curves) {
      if (!curve.startConnectorKey || !curve.endConnectorKey || curve.lengthMm <= 1e-6) {
        continue;
      }
      const routeKey = `${curve.startConnectorKey}->${curve.endConnectorKey}`;
      if (seen.has(routeKey)) {
        continue;
      }
      seen.add(routeKey);

      const yStart = connectorElevationsMm[curve.startConnectorKey] ?? 0;
      const yEnd = connectorElevationsMm[curve.endConnectorKey] ?? 0;
      if (Math.abs(yStart) <= 1e-6 && Math.abs(yEnd) <= 1e-6) {
        continue;
      }

      result.push({
        key: routeKey,
        grade: ((yEnd - yStart) / curve.lengthMm) * 100,
        midY: (yStart + yEnd) / 2,
      });
    }

    return result.slice(0, 2);
  }, [componentDef, isSelected, item.connectorElevationsMm]);

  return (
    <group
      position={[item.x, 0, item.y]}
      rotation={[0, -toRad(item.rotationDeg), 0]}
      onClick={handleClick}
    >
      {railResult.geometries.map((geometry, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={isSelected ? selectedRailMaterial : railMaterial}
        />
      ))}
      {gradeInfo.map((entry, index) => (
        <Html
          key={entry.key}
          position={[0, entry.midY + 8 + index * 8, 0]}
          center
          distanceFactor={220}
        >
          <span className="pointer-events-none text-[9px] text-amber-300">
            {entry.grade.toFixed(1)}%
          </span>
        </Html>
      ))}
    </group>
  );
}
