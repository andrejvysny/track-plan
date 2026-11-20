import { useState, useCallback, useEffect, useMemo } from 'react';
import type { PlacedItem } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';
import { getCachedTrackGeometry } from '../../../geometry/trackGeometryCache3D';
import { getConnectorPositions3D } from '../../../geometry/trackGeometry3D';

interface ElevationPanelProps {
  item: PlacedItem;
  componentDef: TrackComponentDefinition;
  onUpdateElevation: (itemId: string, connectorElevationsMm: Record<string, number>) => void;
}

export function ElevationPanel({ item, componentDef, onUpdateElevation }: ElevationPanelProps) {
  const connectorKeys = useMemo(
    () => getConnectorPositions3D(componentDef).map((connector) => connector.key),
    [componentDef]
  );

  const cached = useMemo(() => getCachedTrackGeometry(componentDef), [componentDef]);
  const orderedConnectorKeys = useMemo(() => {
    const inferredConnectorKeys = Array.from(
      new Set(
        cached.curves.flatMap((curve) =>
          [curve.startConnectorKey, curve.endConnectorKey].filter(Boolean)
        )
      )
    ) as string[];

    return Array.from(
      new Set([
        ...connectorKeys,
        ...inferredConnectorKeys,
        ...Object.keys(item.connectorElevationsMm ?? {}),
      ])
    ).filter(Boolean);
  }, [cached.curves, connectorKeys, item.connectorElevationsMm]);

  const [elevations, setElevations] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const key of orderedConnectorKeys) {
      initial[key] = item.connectorElevationsMm?.[key] ?? 0;
    }
    return initial;
  });

  // Sync when selection changes
  useEffect(() => {
    const next: Record<string, number> = {};
    for (const key of orderedConnectorKeys) {
      next[key] = item.connectorElevationsMm?.[key] ?? 0;
    }
    setElevations((previous) => {
      const previousKeys = Object.keys(previous);
      if (
        previousKeys.length === orderedConnectorKeys.length &&
        orderedConnectorKeys.every(
          (key) => Math.abs((previous[key] ?? 0) - (next[key] ?? 0)) <= 1e-6
        )
      ) {
        return previous;
      }
      return next;
    });
  }, [item.id, item.connectorElevationsMm, orderedConnectorKeys]);

  const routeGrades = useMemo(
    () =>
      Array.from(
        new Map(
          cached.curves
            .filter(
              (curve) => curve.startConnectorKey && curve.endConnectorKey && curve.lengthMm > 1e-6
            )
            .map((curve) => {
              const startKey = curve.startConnectorKey as string;
              const endKey = curve.endConnectorKey as string;
              const startMm = elevations[startKey] ?? 0;
              const endMm = elevations[endKey] ?? 0;
              const grade = ((endMm - startMm) / curve.lengthMm) * 100;
              return [`${startKey}->${endKey}`, grade] as const;
            })
        ).entries()
      ),
    [cached.curves, elevations]
  );

  const label = componentDef.article ?? componentDef.label;

  const handleApply = useCallback(() => {
    onUpdateElevation(item.id, elevations);
  }, [item.id, elevations, onUpdateElevation]);

  return (
    <div className="absolute bottom-3 left-3 w-64 rounded-lg bg-slate-900/90 p-3 text-xs text-slate-200 backdrop-blur-sm">
      <div className="mb-2 font-medium text-slate-100">{label}</div>

      <div className="mb-2 max-h-36 space-y-1.5 overflow-y-auto pr-1">
        {orderedConnectorKeys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <label className="w-16 text-slate-400">{key}</label>
            <input
              type="number"
              value={elevations[key] ?? 0}
              onChange={(e) =>
                setElevations((prev) => ({
                  ...prev,
                  [key]: Number(e.target.value) || 0,
                }))
              }
              className="flex-1 rounded bg-slate-800 px-2 py-1 text-right text-slate-100 outline-none focus:ring-1 focus:ring-sky-500"
              step={1}
            />
            <span className="text-slate-500">mm</span>
          </div>
        ))}
      </div>

      {routeGrades.length > 0 && (
        <div className="mb-2 max-h-20 space-y-1 overflow-y-auto rounded bg-slate-800/60 p-2">
          {routeGrades.map(([routeKey, grade]) => (
            <div key={routeKey} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">{routeKey}</span>
              <span className={Math.abs(grade) > 4 ? 'text-amber-400' : 'text-slate-300'}>
                {grade.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleApply}
        className="w-full rounded bg-sky-600 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
      >
        Apply to connected
      </button>
    </div>
  );
}
