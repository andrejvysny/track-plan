import { useMemo } from 'react';
import * as THREE from 'three';
import type { LayoutState } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';
import { getConnectorPositions3D } from '../../../geometry/trackGeometry3D';
import { toRad } from '../../../geometry/geometryUtils';

const connectedMaterial = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.4 });
const disconnectedMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
const sphereGeometry = new THREE.SphereGeometry(3, 8, 8);

interface ConnectionIndicatorsProps {
  layout: LayoutState;
  componentMap: Map<string, TrackComponentDefinition>;
}

export function ConnectionIndicators({ layout, componentMap }: ConnectionIndicatorsProps) {
  const indicators = useMemo(() => {
    const connectedKeys = new Set<string>();
    for (const conn of layout.connections) {
      for (const ep of conn.endpoints) {
        connectedKeys.add(`${ep.itemId}:${ep.connectorKey}`);
      }
    }

    const result: { position: THREE.Vector3; connected: boolean }[] = [];
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
        pos.y = 5;
        const key = `${item.id}:${c.key}`;
        result.push({ position: pos, connected: connectedKeys.has(key) });
      }
    }

    return result;
  }, [layout, componentMap]);

  return (
    <group>
      {indicators.map((ind, i) => (
        <mesh
          key={i}
          geometry={sphereGeometry}
          material={ind.connected ? connectedMaterial : disconnectedMaterial}
          position={ind.position}
        />
      ))}
    </group>
  );
}
