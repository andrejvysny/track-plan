import { useState } from 'react'
import type { TrackComponentType } from '../../types/trackSystem'
import type { TrackUsageComponentCount } from '../../types/trackUsage'
import {
  TRACK_COMPONENT_TYPE_LABELS,
  TRACK_COMPONENT_TYPES,
} from '../../constants/trackUsage'

interface TrackUsageCounterProps {
  totalCount: number
  typeCounts: Record<TrackComponentType, number>
  componentCounts: TrackUsageComponentCount[]
}

export function TrackUsageCounter({ totalCount, typeCounts, componentCounts }: TrackUsageCounterProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed bottom-4 right-4 flex flex-col items-end gap-2">
      <button
        type="button"
        className="flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 px-5 py-2 text-sm font-semibold text-white transition hover:border-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="mr-2 text-xs uppercase tracking-wide text-slate-400">Tracks</span>
        <span>{totalCount}</span>
      </button>

      {isOpen && (
        <div className="w-72 rounded-2xl border border-white/5 bg-slate-950/90 p-3 text-xs text-slate-200 shadow-2xl backdrop-blur">
          <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-slate-400">Count by type</div>
          <div className="flex flex-col gap-1">
            {TRACK_COMPONENT_TYPES.map((type) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-slate-300">{TRACK_COMPONENT_TYPE_LABELS[type]}</span>
                <span className="font-semibold text-white">{typeCounts[type] ?? 0}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] uppercase tracking-[0.3em] text-slate-400">Count by track</div>
          {componentCounts.length === 0 ? (
            <div className="text-[11px] text-slate-500">Place tracks to see counts</div>
          ) : (
            <div className="mt-1 flex max-h-40 flex-col gap-2 overflow-y-auto">
              {componentCounts.map((entry) => (
                <div key={entry.componentId} className="flex items-start justify-between gap-2 text-[11px]">
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate text-slate-100">{entry.label}</span>
                    <span className="truncate text-[10px] text-slate-500">
                      {TRACK_COMPONENT_TYPE_LABELS[entry.type]}
                      {entry.article ? ` · ${entry.article}` : ''}
                    </span>
                  </div>
                  <span className="ml-3 flex-shrink-0 font-semibold text-white">{entry.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
