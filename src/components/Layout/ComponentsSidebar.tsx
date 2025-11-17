import type { DragEvent } from 'react'
import type { TrackComponentDefinition, TrackSystemDefinition } from '../../types/trackSystem'

interface ComponentsSidebarProps {
  trackSystem: TrackSystemDefinition | null
  onComponentClick?: (component: TrackComponentDefinition) => void
}

export function ComponentsSidebar({ trackSystem, onComponentClick }: ComponentsSidebarProps) {
  const handleDragStart = (event: DragEvent<HTMLButtonElement>, component: TrackComponentDefinition) => {
    if (!trackSystem) return
    const payload = {
      type: 'track-component',
      trackSystemId: trackSystem.id,
      componentId: component.id,
    }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
  }

  return (
    <aside className="sidebar-right w-64 border-l border-slate-800 bg-slate-950 flex flex-col text-slate-100">
      <header className="flex flex-col gap-1 border-b border-slate-800 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Components</span>
        <p className="text-sm font-medium text-slate-100">
          {trackSystem ? `Components – ${trackSystem.name}` : 'No active track system'}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {trackSystem ? (
          <ul className="space-y-2">
            {trackSystem.components.map((component) => (
              <li key={component.id}>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => handleDragStart(event, component)}
                  onClick={() => onComponentClick?.(component)}
                  className="flex w-full items-center justify-between rounded border border-slate-800/80 bg-slate-900/70 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-900/90"
                >
                  <span>{component.label}</span>
                  <span className="text-xs uppercase tracking-wide text-slate-500">{component.type}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Activate a project to browse components.</p>
        )}
      </div>
    </aside>
  )
}
