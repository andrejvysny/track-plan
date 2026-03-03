import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { LayoutState } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';
import { getCachedTrackGeometry } from '../../../geometry/trackGeometryCache3D';
import { toRad } from '../../../geometry/geometryUtils';

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
      const elevStart = item.elevationStartMm ?? 0;
      const elevEnd = item.elevationEndMm ?? 0;
      const totalLen = cached.curves.reduce((s, c) => s + c.lengthMm, 0);

      let accLen = 0;
      for (let ci = 0; ci < cached.curves.length; ci++) {
        const curve = cached.curves[ci];
        const curveStartFrac = totalLen > 0 ? accLen / totalLen : 0;
        const curveEndFrac = totalLen > 0 ? (accLen + curve.lengthMm) / totalLen : 1;
        accLen += curve.lengthMm;

        const numTies = Math.max(1, Math.floor(curve.lengthMm / 10));
        for (let i = 0; i <= numTies; i++) {
          const t = i / numTies;
          const globalT = curveStartFrac + t * (curveEndFrac - curveStartFrac);
          const yElev = elevStart + globalT * (elevEnd - elevStart);

          const point = curve.centerline.getPoint(t);
          const tangent = curve.centerline.getTangent(t);
          const localRotY = Math.atan2(tangent.x, tangent.z);

          // Rotate local position by item rotation
          const wx = item.x + point.x * cosR - point.z * sinR;
          const wz = item.y + point.x * sinR + point.z * cosR;
          const wy = yElev - TIE_DEPTH / 2;

          ties.push({ x: wx, y: wy, z: wz, rotY: localRotY - rotAngle });
        }
      }
    }

    return ties;
  }, [layout, componentMap]);

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
  }, [worldTies]);

  if (worldTies.length === 0) return null;

  return <instancedMesh ref={meshRef} args={[tieGeometry, tieMaterial, worldTies.length]} />;
}
