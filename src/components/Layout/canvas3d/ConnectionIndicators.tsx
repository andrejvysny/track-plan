import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import type { LayoutState } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';
import { getConnectorPositions3D } from '../../../geometry/trackGeometry3D';
import { toRad } from '../../../geometry/geometryUtils';
import { getConnectorElevationMm } from '../../../utils/elevationUtils';

const connectedMaterial = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.4 });
const disconnectedMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
const sphereGeometry = new THREE.SphereGeometry(3, 8, 8);

interface ConnectionIndicatorsProps {
  layout: LayoutState;
  componentMap: Map<string, TrackComponentDefinition>;
}

export function ConnectionIndicators({ layout, componentMap }: ConnectionIndicatorsProps) {
  const connectedRef = useRef<THREE.InstancedMesh>(null);
  const disconnectedRef = useRef<THREE.InstancedMesh>(null);

  const indicators = useMemo(() => {
    const connectedKeys = new Set<string>();
    for (const conn of layout.connections) {
      for (const ep of conn.endpoints) {
        connectedKeys.add(`${ep.itemId}:${ep.connectorKey}`);
      }
    }

    const connected: THREE.Vector3[] = [];
    const disconnected: THREE.Vector3[] = [];
    const yAxis = new THREE.Vector3(0, 1, 0);

    for (const item of layout.placedItems) {
      const def = componentMap.get(item.componentId);
      if (!def) continue;

      const connectors = getConnectorPositions3D(def);
      const rotRad = -toRad(item.rotationDeg);

      for (const c of connectors) {
        const pos = c.position.clone().applyAxisAngle(yAxis, rotRad);
        pos.x += item.x;
        pos.z += item.y;
        pos.y = getConnectorElevationMm(item, c.key) + 5;
        const key = `${item.id}:${c.key}`;
        if (connectedKeys.has(key)) {
          connected.push(pos);
        } else {
          disconnected.push(pos);
        }
      }
    }

    return { connected, disconnected };
  }, [layout.connections, layout.placedItems, componentMap]);

  useEffect(() => {
    const matrix = new THREE.Matrix4();

    const connectedMesh = connectedRef.current;
    if (connectedMesh) {
      indicators.connected.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y, position.z);
        connectedMesh.setMatrixAt(index, matrix);
      });
      connectedMesh.instanceMatrix.needsUpdate = true;
      connectedMesh.computeBoundingSphere();
      connectedMesh.computeBoundingBox();
    }

    const disconnectedMesh = disconnectedRef.current;
    if (disconnectedMesh) {
      indicators.disconnected.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y, position.z);
        disconnectedMesh.setMatrixAt(index, matrix);
      });
      disconnectedMesh.instanceMatrix.needsUpdate = true;
      disconnectedMesh.computeBoundingSphere();
      disconnectedMesh.computeBoundingBox();
    }
  }, [indicators]);

  return (
    <group>
      {indicators.connected.length > 0 && (
        <instancedMesh
          ref={connectedRef}
          args={[sphereGeometry, connectedMaterial, indicators.connected.length]}
          frustumCulled={false}
        />
      )}
      {indicators.disconnected.length > 0 && (
        <instancedMesh
          ref={disconnectedRef}
          args={[sphereGeometry, disconnectedMaterial, indicators.disconnected.length]}
          frustumCulled={false}
        />
      )}
    </group>
  );
}
