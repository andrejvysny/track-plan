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
    <aside className="sidebar-right w-64 border-l border-gray-200 bg-gray-50 flex flex-col">
      <header className="flex flex-col gap-1 border-b border-gray-200 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Components</span>
        <p className="text-sm font-medium text-slate-900">
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
                  className="flex w-full items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <span>{component.label}</span>
                  <span className="text-xs uppercase tracking-wide text-gray-400">{component.type}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Activate a project to browse components.</p>
        )}
      </div>
    </aside>
  )
}
