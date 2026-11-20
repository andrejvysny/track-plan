import { useMemo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { PlacedItem } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';

interface TrackLabelsProps {
  items: PlacedItem[];
  componentMap: Map<string, TrackComponentDefinition>;
  selectedItemIds?: Set<string>;
}

const LABEL_DISTANCE_MM = 2600;
const MAX_LABELS = 80;

export function TrackLabels({ items, componentMap, selectedItemIds }: TrackLabelsProps) {
  const camera = useThree((state) => state.camera);
  const [cameraBucket, setCameraBucket] = useState('0:0:0');
  const bucketRef = useRef(cameraBucket);

  useFrame(() => {
    const key = `${Math.round(camera.position.x / 300)}:${Math.round(camera.position.y / 220)}:${Math.round(camera.position.z / 300)}`;
    if (bucketRef.current !== key) {
      bucketRef.current = key;
      setCameraBucket(key);
    }
  });

  const visibleItems = useMemo(() => {
    const selected = selectedItemIds ?? new Set<string>();
    const nearby: { item: PlacedItem; distanceSq: number }[] = [];
    const distanceLimitSq = LABEL_DISTANCE_MM * LABEL_DISTANCE_MM;

    for (const item of items) {
      if (selected.has(item.id)) {
        nearby.push({ item, distanceSq: 0 });
        continue;
      }
      const dx = item.x - camera.position.x;
      const dz = item.y - camera.position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq <= distanceLimitSq) {
        nearby.push({ item, distanceSq });
      }
    }

    nearby.sort((a, b) => a.distanceSq - b.distanceSq);
    return nearby.slice(0, MAX_LABELS).map((entry) => entry.item);
  }, [camera.position.x, camera.position.z, cameraBucket, items, selectedItemIds]);

  return (
    <group>
      {visibleItems.map((item) => {
        const def = componentMap.get(item.componentId);
        if (!def) return null;
        const label = def.article ?? def.label;
        return (
          <Html key={item.id} position={[item.x, 10, item.y]} center distanceFactor={300}>
            <div className="pointer-events-none select-none rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-slate-200">
              {label}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
