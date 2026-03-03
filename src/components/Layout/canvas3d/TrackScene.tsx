import { useMemo } from 'react';
import type { LayoutState } from '../../../types/layout';
import type { TrackSystemDefinition, TrackComponentDefinition } from '../../../types/trackSystem';
import { TrackPiece3D } from './TrackPiece3D';
import { GlobalTies } from './GlobalTies';
import { ConnectionIndicators } from './ConnectionIndicators';

interface TrackSceneProps {
  layout: LayoutState;
  trackSystem: TrackSystemDefinition;
  selectedItemIds?: Set<string>;
  onItemClick?: (itemId: string) => void;
}

export function TrackScene({ layout, trackSystem, selectedItemIds, onItemClick }: TrackSceneProps) {
  const componentMap = useMemo(() => {
    const map = new Map<string, TrackComponentDefinition>();
    for (const comp of trackSystem.components) {
      map.set(comp.id, comp);
    }
    return map;
  }, [trackSystem]);

  return (
    <group>
      {layout.placedItems.map((item) => {
        const def = componentMap.get(item.componentId);
        if (!def) return null;
        return (
          <TrackPiece3D
            key={item.id}
            item={item}
            componentDef={def}
            isSelected={selectedItemIds?.has(item.id)}
            onClick={onItemClick}
          />
        );
      })}
      <GlobalTies layout={layout} componentMap={componentMap} />
      <ConnectionIndicators layout={layout} componentMap={componentMap} />
    </group>
  );
}
