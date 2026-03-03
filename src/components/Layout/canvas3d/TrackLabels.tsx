import { Html } from '@react-three/drei';
import type { PlacedItem } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';

interface TrackLabelsProps {
  items: PlacedItem[];
  componentMap: Map<string, TrackComponentDefinition>;
}

export function TrackLabels({ items, componentMap }: TrackLabelsProps) {
  return (
    <group>
      {items.map((item) => {
        const def = componentMap.get(item.componentId);
        if (!def) return null;
        const label = def.article ?? def.label;
        return (
          <Html key={item.id} position={[item.x, 10, item.y]} center distanceFactor={300} occlude>
            <div className="pointer-events-none select-none rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-slate-200">
              {label}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
