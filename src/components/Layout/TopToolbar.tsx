import type { Project } from '../../types/project'
import type { ShapeType } from '../../types/layout'
import { Undo, Redo } from 'lucide-react'

interface TopToolbarProps {
  activeProject: Project | null
  onNewProject: () => void
  onReload: () => void
  onResetLayout: () => void
  onExportSvg: () => void
  onImport: () => void
  onConnectEndpoints: () => void
  onDisconnectEndpoints: () => void
  onRotateSelectedLeft: () => void
  onRotateSelectedRight: () => void
  onDeleteSelected: () => void
  onToggleGrounded: () => void
  onUndo: () => void
  onRedo: () => void
  onToggleDebug: () => void
  canConnectEndpoints: boolean
  canDisconnectEndpoints: boolean
  canRotateSelection: boolean
  canDeleteSelection: boolean
  canUndo: boolean
  canRedo: boolean
  canToggleGroundSelection: boolean
  isSelectionGrounded: boolean
  debugMode: boolean
  drawingTool: ShapeType | null
  onDrawingToolChange: (tool: ShapeType | null) => void
  onDimensionAction?: (type: 'center' | 'inner' | 'outer') => boolean
}

export function TopToolbar({
  activeProject,
  onNewProject,
  onReload,
  onResetLayout,
  onExportSvg,
  onImport,
  onConnectEndpoints,
  onDisconnectEndpoints,
  onRotateSelectedLeft,
  onRotateSelectedRight,
  onDeleteSelected,
  onToggleGrounded,
  onUndo,
  onRedo,
  onToggleDebug,
  canConnectEndpoints,
  canDisconnectEndpoints,
  canRotateSelection,
  canDeleteSelection,
  canUndo,
  canRedo,
  canToggleGroundSelection,
  isSelectionGrounded,
  debugMode,
  drawingTool,
  onDrawingToolChange,
  onDimensionAction,
}: TopToolbarProps) {
  const baseControlStyles =
    'rounded border px-2 py-1 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
  const accentButton =
    'border-blue-500/60 bg-blue-500/10 text-blue-200 hover:border-blue-400 hover:bg-blue-500/20 disabled:border-slate-800 disabled:bg-slate-900/70 disabled:text-slate-600'
  const dangerButton =
    'border-red-500/60 bg-red-500/10 text-red-300 hover:border-red-400 hover:bg-red-500/20 disabled:border-slate-800 disabled:bg-slate-900/70 disabled:text-slate-600'
  const rotateButton =
    'border-slate-800 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800 disabled:border-slate-800 disabled:bg-slate-900/70 disabled:text-slate-600'
  const groundButton =
    'border-amber-500/60 bg-amber-500/10 text-amber-300 hover:border-amber-400 hover:bg-amber-500/20 disabled:border-slate-800 disabled:bg-slate-900/70 disabled:text-slate-600'
  const debugButton =
    'border-purple-500/60 bg-purple-500/10 text-purple-300 hover:border-purple-400 hover:bg-purple-500/20'
  const shapeButton =
    'border-green-500/60 bg-green-500/10 text-green-300 hover:border-green-400 hover:bg-green-500/20'
  const shapeButtonActive =
    'border-green-400 bg-green-500/30 text-green-200 hover:border-green-300 hover:bg-green-500/40'
  const iconButton = 'rounded border border-slate-800 bg-slate-900 p-2 text-slate-100 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100'
  const projectActionButton =
    'rounded border border-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 transition hover:border-slate-600 hover:text-slate-100 disabled:border-slate-800 disabled:text-slate-600 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500/60'
  return (
    <header className="toolbar-top flex h-12 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 text-slate-100">
      <div>
        <p className="text-sm font-semibold text-slate-100">Track Planner</p>
        <p className="text-xs text-slate-400">
          {activeProject ? `Project • ${activeProject.name}` : 'No project selected'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onNewProject} className={projectActionButton}>
            New project
          </button>
          <button
            type="button"
            onClick={onReload}
            disabled={!activeProject}
            className={projectActionButton}
          >
            Reload
          </button>
          <button
            type="button"
            onClick={onResetLayout}
            disabled={!activeProject}
            className={projectActionButton}
          >
            Reset layout
          </button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={`${iconButton} ${canUndo ? '' : 'opacity-60 cursor-not-allowed'}`}
            title="Undo"
          >
            <Undo className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={`${iconButton} ${canRedo ? '' : 'opacity-60 cursor-not-allowed'}`}
            title="Redo"
          >
            <Redo className="h-4 w-4" aria-hidden />
          </button>
          <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
            <span className="text-xs text-slate-400">Shapes:</span>
            <button
              type="button"
              onClick={() => onDrawingToolChange(drawingTool === 'rectangle' ? null : 'rectangle')}
              className={`${baseControlStyles} ${drawingTool === 'rectangle' ? shapeButtonActive : shapeButton}`}
              title="Draw Rectangle"
            >
              ▭
            </button>
            <button
              type="button"
              onClick={() => onDrawingToolChange(drawingTool === 'circle' ? null : 'circle')}
              className={`${baseControlStyles} ${drawingTool === 'circle' ? shapeButtonActive : shapeButton}`}
              title="Draw Circle"
            >
              ○
            </button>
            <button
              type="button"
              onClick={() => onDrawingToolChange(drawingTool === 'text' ? null : 'text')}
              className={`${baseControlStyles} ${drawingTool === 'text' ? shapeButtonActive : shapeButton}`}
              title="Add Text"
            >
              T
            </button>
          </div>
          <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
            <span className="text-xs text-slate-400">Dim:</span>
            <button
              type="button"
              onClick={() => {
                if (onDimensionAction && onDimensionAction('center')) {
                  return
                }
                onDrawingToolChange(drawingTool === 'dimension' ? null : 'dimension')
              }}
              className={`${baseControlStyles} ${drawingTool === 'dimension' ? shapeButtonActive : shapeButton}`}
              title="Center to Center (or Draw Custom)"
            >
              ⟷
            </button>
            <button
              type="button"
              onClick={() => onDimensionAction?.('inner')}
              className={`${baseControlStyles} ${shapeButton}`}
              title="Inner Edge to Inner Edge"
            >
              →←
            </button>
            <button
              type="button"
              onClick={() => onDimensionAction?.('outer')}
              className={`${baseControlStyles} ${shapeButton}`}
              title="Outer Edge to Outer Edge"
            >
              ←→
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center gap-3">
          <button
            type="button"
            onClick={onConnectEndpoints}
            disabled={!canConnectEndpoints}
            className={`${baseControlStyles} ${accentButton}`}
          >
            Connect endpoints
          </button>
          <button
            type="button"
            onClick={onDisconnectEndpoints}
            disabled={!canDisconnectEndpoints}
            className={`${baseControlStyles} ${dangerButton}`}
          >
            Disconnect
          </button>
          <button
            type="button"
            onClick={onRotateSelectedLeft}
            disabled={!canRotateSelection}
            className={`${baseControlStyles} ${rotateButton}`}
          >
            Rotate ⟲
          </button>
          <button
            type="button"
            onClick={onRotateSelectedRight}
            disabled={!canRotateSelection}
            className={`${baseControlStyles} ${rotateButton}`}
          >
            Rotate ⟳
          </button>
          <button
            type="button"
            onClick={onToggleGrounded}
            disabled={!canToggleGroundSelection}
            className={`${baseControlStyles} ${groundButton}`}
          >
            {isSelectionGrounded ? 'Unground' : 'Ground'}
          </button>
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={!canDeleteSelection}
            className={`${baseControlStyles} ${dangerButton}`}
          >
            Delete
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleDebug}
            className={`${baseControlStyles} ${debugButton} ${debugMode ? 'border-purple-400 bg-purple-500/30' : ''}`}
          >
            DEBUG
          </button>
          <button
            type="button"
            onClick={onExportSvg}
            className={`${baseControlStyles} border-slate-800 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100`}
          >
            Export SVG
          </button>
          <button
            type="button"
            onClick={onImport}
            className={`${baseControlStyles} border-slate-800 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100`}
          >
            Import
          </button>
        </div>
      </div>
    </header>
  )
}
