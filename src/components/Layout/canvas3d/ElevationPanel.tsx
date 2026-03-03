import { useState, useCallback, useEffect } from 'react';
import type { PlacedItem } from '../../../types/layout';
import type { TrackComponentDefinition } from '../../../types/trackSystem';
import { getCachedTrackGeometry } from '../../../geometry/trackGeometryCache3D';

interface ElevationPanelProps {
  item: PlacedItem;
  componentDef: TrackComponentDefinition;
  onUpdateElevation: (itemId: string, startMm: number, endMm: number) => void;
}

export function ElevationPanel({ item, componentDef, onUpdateElevation }: ElevationPanelProps) {
  const [startMm, setStartMm] = useState(item.elevationStartMm ?? 0);
  const [endMm, setEndMm] = useState(item.elevationEndMm ?? 0);

  // Sync when selection changes
  useEffect(() => {
    setStartMm(item.elevationStartMm ?? 0);
    setEndMm(item.elevationEndMm ?? 0);
  }, [item.id, item.elevationStartMm, item.elevationEndMm]);

  const cached = getCachedTrackGeometry(componentDef);
  const totalLength = cached.curves.reduce((sum, c) => sum + c.lengthMm, 0);
  const grade = totalLength > 0 ? ((endMm - startMm) / totalLength) * 100 : 0;

  const label = componentDef.article ?? componentDef.label;

  const handleApply = useCallback(() => {
    onUpdateElevation(item.id, startMm, endMm);
  }, [item.id, startMm, endMm, onUpdateElevation]);

  return (
    <div className="absolute bottom-3 left-3 w-56 rounded-lg bg-slate-900/90 p-3 text-xs text-slate-200 backdrop-blur-sm">
      <div className="mb-2 font-medium text-slate-100">{label}</div>

      <div className="mb-1.5 flex items-center gap-2">
        <label className="w-12 text-slate-400">Start</label>
        <input
          type="number"
          value={startMm}
          onChange={(e) => setStartMm(Number(e.target.value) || 0)}
          className="flex-1 rounded bg-slate-800 px-2 py-1 text-right text-slate-100 outline-none focus:ring-1 focus:ring-sky-500"
          step={1}
        />
        <span className="text-slate-500">mm</span>
      </div>

      <div className="mb-1.5 flex items-center gap-2">
        <label className="w-12 text-slate-400">End</label>
        <input
          type="number"
          value={endMm}
          onChange={(e) => setEndMm(Number(e.target.value) || 0)}
          className="flex-1 rounded bg-slate-800 px-2 py-1 text-right text-slate-100 outline-none focus:ring-1 focus:ring-sky-500"
          step={1}
        />
        <span className="text-slate-500">mm</span>
      </div>

      <div className="mb-2 flex items-center gap-2 text-slate-400">
        <span className="w-12">Grade</span>
        <span
          className={`flex-1 text-right ${Math.abs(grade) > 4 ? 'text-amber-400' : 'text-slate-300'}`}
        >
          {grade.toFixed(1)}%
        </span>
      </div>

      <button
        onClick={handleApply}
        className="w-full rounded bg-sky-600 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
      >
        Apply to connected
      </button>
    </div>
  );
}
