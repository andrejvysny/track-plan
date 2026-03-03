import { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Outlines, Html } from '@react-three/drei';
import type { PlacedItem } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';
import { getCachedTrackGeometry } from '../../../geometry/trackGeometryCache3D';
import { applyElevationToCurves } from '../../../geometry/trackGeometry3D';
import { toRad } from '../../../geometry/geometryUtils';

// Shared materials (created once)
const railMaterial = new THREE.MeshStandardMaterial({
  color: 0x888888,
  metalness: 0.8,
  roughness: 0.3,
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

  const rails = useMemo(() => {
    const cached = getCachedTrackGeometry(componentDef);
    const startMm = item.elevationStartMm ?? 0;
    const endMm = item.elevationEndMm ?? 0;
    const hasElevation = startMm !== 0 || endMm !== 0;

    if (!hasElevation) {
      return cached.railGeometries;
    }

    // Clone curves, apply elevation, regenerate tube geometries
    const elevated = applyElevationToCurves(cached.curves, startMm, endMm);
    return elevated
      .map((curve) => {
        const tubularSegments = Math.max(8, Math.ceil(curve.lengthMm / 5));
        return [
          new THREE.TubeGeometry(curve.leftRail, tubularSegments, RAIL_RADIUS_MM, 6, false),
          new THREE.TubeGeometry(curve.rightRail, tubularSegments, RAIL_RADIUS_MM, 6, false),
        ];
      })
      .flat();
  }, [componentDef, item.elevationStartMm, item.elevationEndMm]);

  // Grade label for elevated tracks
  const gradeInfo = useMemo(() => {
    const startMm = item.elevationStartMm ?? 0;
    const endMm = item.elevationEndMm ?? 0;
    if (startMm === 0 && endMm === 0) return null;

    const cached = getCachedTrackGeometry(componentDef);
    const totalLength = cached.curves.reduce((sum, c) => sum + c.lengthMm, 0);
    if (totalLength === 0) return null;

    const grade = ((endMm - startMm) / totalLength) * 100;
    const midY = (startMm + endMm) / 2;
    return { grade, midY };
  }, [componentDef, item.elevationStartMm, item.elevationEndMm]);

  return (
    <group
      position={[item.x, 0, item.y]}
      rotation={[0, -toRad(item.rotationDeg), 0]}
      onClick={handleClick}
    >
      {rails.map((geometry, i) => (
        <mesh key={i} geometry={geometry} material={railMaterial}>
          {isSelected && <Outlines thickness={2} screenspace color="#38bdf8" />}
        </mesh>
      ))}
      {gradeInfo && (
        <Html position={[0, gradeInfo.midY + 8, 0]} center distanceFactor={200}>
          <span className="text-[9px] text-amber-300">{gradeInfo.grade.toFixed(1)}%</span>
        </Html>
      )}
    </group>
  );
}
