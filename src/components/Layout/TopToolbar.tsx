import type { Project } from '../../types/project'

interface TopToolbarProps {
  activeProject: Project | null
  onNewProject: () => void
  onSave: () => void
  onReload: () => void
  onResetLayout: () => void
  onExportSvg: () => void
  onImport: () => void
  onConnectEndpoints: () => void
  onRotateSelectedLeft: () => void
  onRotateSelectedRight: () => void
  onDeleteSelected: () => void
  canConnectEndpoints: boolean
  canRotateSelection: boolean
  canDeleteSelection: boolean
}

export function TopToolbar({
  activeProject,
  onNewProject,
  onSave,
  onReload,
  onResetLayout,
  onExportSvg,
  onImport,
  onConnectEndpoints,
  onRotateSelectedLeft,
  onRotateSelectedRight,
  onDeleteSelected,
  canConnectEndpoints,
  canRotateSelection,
  canDeleteSelection,
}: TopToolbarProps) {
  return (
    <header className="toolbar-top flex h-12 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">Track Planner</p>
        <p className="text-xs text-gray-500">
          {activeProject ? `Project • ${activeProject.name}` : 'No project selected'}
        </p>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <button
          type="button"
          onClick={onNewProject}
          className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-100"
        >
          New Project
        </button>
        <button
          type="button"
          onClick={onSave}
          className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-100"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onReload}
          className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-100"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onResetLayout}
          className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-100"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onExportSvg}
          className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-100"
        >
          Export SVG
        </button>
        <button
          type="button"
          onClick={onImport}
          className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-100"
        >
          Import
        </button>

        <div className="h-6 w-px bg-gray-200" aria-hidden="true" />

        <button
          type="button"
          onClick={onConnectEndpoints}
          disabled={!canConnectEndpoints}
          className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-600 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
        >
          Connect endpoints
        </button>
        <button
          type="button"
          onClick={onRotateSelectedLeft}
          disabled={!canRotateSelection}
          className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
        >
          Rotate ⟲
        </button>
        <button
          type="button"
          onClick={onRotateSelectedRight}
          disabled={!canRotateSelection}
          className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
        >
          Rotate ⟳
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={!canDeleteSelection}
          className="rounded border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
        >
          Delete
        </button>
      </div>
    </header>
  )
}
