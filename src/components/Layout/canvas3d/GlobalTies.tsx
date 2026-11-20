import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { LayoutState } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';
import { getCachedTrackGeometry } from '../../../geometry/trackGeometryCache3D';
import { toRad } from '../../../geometry/geometryUtils';
import { getConnectorElevationMm } from '../../../utils/elevationUtils';

const tieMaterial = new THREE.MeshStandardMaterial({
  color: 0x6b4226,
  roughness: 0.9,
  metalness: 0.05,
});

const TIE_WIDTH = 17;
const TIE_DEPTH = 1.5;
const tieGeometry = new THREE.BoxGeometry(TIE_WIDTH, TIE_DEPTH, 2);

interface GlobalTiesProps {
  layout: LayoutState;
  componentMap: Map<string, TrackComponentDefinition>;
}

interface WorldTie {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export function GlobalTies({ layout, componentMap }: GlobalTiesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const worldTies = useMemo(() => {
    const ties: WorldTie[] = [];

    for (const item of layout.placedItems) {
      const def = componentMap.get(item.componentId);
      if (!def) continue;

      const cached = getCachedTrackGeometry(def);
      const rotAngle = toRad(item.rotationDeg);
      const cosR = Math.cos(rotAngle);
      const sinR = Math.sin(rotAngle);

      for (const tie of cached.tiePositions) {
        const yStart = tie.startConnectorKey
          ? getConnectorElevationMm(item, tie.startConnectorKey)
          : 0;
        const yEnd = tie.endConnectorKey
          ? getConnectorElevationMm(item, tie.endConnectorKey)
          : yStart;
        const yElev = yStart + tie.t * (yEnd - yStart);

        const wx = item.x + tie.position.x * cosR - tie.position.z * sinR;
        const wz = item.y + tie.position.x * sinR + tie.position.z * cosR;
        const wy = yElev - TIE_DEPTH / 2;

        ties.push({ x: wx, y: wy, z: wz, rotY: tie.rotationY - rotAngle });
      }
    }

    return ties;
  }, [layout.placedItems, componentMap]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || worldTies.length === 0) return;

    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);
    const euler = new THREE.Euler();

    for (let i = 0; i < worldTies.length; i++) {
      const tie = worldTies[i];
      pos.set(tie.x, tie.y, tie.z);
      euler.set(0, tie.rotY, 0);
      quat.setFromEuler(euler);
      matrix.compose(pos, quat, scl);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
  }, [worldTies]);

  if (worldTies.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[tieGeometry, tieMaterial, worldTies.length]}
      frustumCulled={false}
    />
  );
}
