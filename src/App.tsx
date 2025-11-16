import { useCallback, useMemo, useRef, useState } from 'react'
import type { TrackComponentDefinition } from './types/trackSystem'
import { Canvas, type CanvasHandle } from './components/Layout/Canvas'
import { ComponentsSidebar } from './components/Layout/ComponentsSidebar'
import { ProjectsSidebar } from './components/Layout/ProjectsSidebar'
import { TopToolbar } from './components/Layout/TopToolbar'
import { useProjectsState } from './state/projectsState'
import { buildLayoutSvgString } from './export/exportSvg'
import type { EndpointRef } from './types/trackSystem'
import { ROTATION_STEP_DEG } from './constants/layout'

function App() {
  const {
    projectsState,
    setProjectsState,
    activeProject,
    setActiveProjectId,
    createProject,
    renameProject,
    deleteProject,
    updateActiveProjectLayout,
    reloadFromLocalStorage,
  } = useProjectsState()

  const activeLayout = activeProject?.layout ?? null
  const canvasRef = useRef<CanvasHandle | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedEndpoints, setSelectedEndpoints] = useState<EndpointRef[]>([])

  const activeTrackSystem = useMemo(
    () =>
      activeLayout?.trackSystems.find((system) => system.id === activeLayout.activeTrackSystemId) ?? null,
    [activeLayout],
  )

  const handleRenameProject = (id: string) => {
    const project = projectsState.projects.find((candidate) => candidate.id === id)
    const currentName = project?.name ?? ''
    const newName = window.prompt('New project name', currentName)?.trim()
    if (newName) {
      renameProject(id, newName)
    }
  }

  const handleDeleteProject = (id: string) => {
    if (window.confirm('Delete this project?')) {
      deleteProject(id)
    }
  }

  const handleResetLayout = () => {
    if (!activeProject) {
      return
    }

    updateActiveProjectLayout((layout) => ({
      ...layout,
      placedItems: [],
    }))
  }

  const handleSave = () => {
    setProjectsState((previous) => ({ ...previous }))
    console.log('Project saved (state already persisted to localStorage)')
  }

  const handleExportSvg = () => {
    if (!activeProject || !activeLayout || !activeTrackSystem) {
      console.warn('Nothing to export yet')
      return
    }

    const svg = buildLayoutSvgString(activeLayout, activeTrackSystem)
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeProject.name ?? 'layout'}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportStub = () => {
    console.log('Import not implemented yet')
  }

  const addComponentToLayout = useCallback(
    (component: TrackComponentDefinition, position?: { x: number; y: number }) => {
      if (!activeTrackSystem) return

      updateActiveProjectLayout((previous) => ({
        ...previous,
        placedItems: [
          ...previous.placedItems,
          {
            id:
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `item-${Date.now()}-${previous.placedItems.length}`,
            trackSystemId: activeTrackSystem.id,
            componentId: component.id,
            x: position?.x ?? 0,
            y: position?.y ?? 0,
            rotationDeg: 0,
          },
        ],
      }))
    },
    [activeTrackSystem, updateActiveProjectLayout],
  )

  const handleComponentClick = (component: TrackComponentDefinition) => {
    addComponentToLayout(component)
  }

  const handleRotateSelected = (deltaDeg: number) => {
    canvasRef.current?.rotateSelected(deltaDeg)
  }

  const handleConnectEndpoints = () => {
    canvasRef.current?.connectSelectedEndpoints()
  }

  const handleDeleteSelected = () => {
    canvasRef.current?.deleteSelectedItem()
  }

  const canRotateSelection = Boolean(selectedItemId)
  const canDeleteSelection = Boolean(selectedItemId)
  const canConnectEndpoints = selectedEndpoints.length === 2

  return (
    <div className="app-root flex h-screen flex-col bg-slate-950 text-slate-100">
      <TopToolbar
        activeProject={activeProject}
        onNewProject={createProject}
        onSave={handleSave}
        onReload={reloadFromLocalStorage}
        onResetLayout={handleResetLayout}
        onExportSvg={handleExportSvg}
        onImport={handleImportStub}
        onConnectEndpoints={handleConnectEndpoints}
        onRotateSelectedLeft={() => handleRotateSelected(-ROTATION_STEP_DEG)}
        onRotateSelectedRight={() => handleRotateSelected(ROTATION_STEP_DEG)}
        onDeleteSelected={handleDeleteSelected}
        canConnectEndpoints={canConnectEndpoints}
        canRotateSelection={canRotateSelection}
        canDeleteSelection={canDeleteSelection}
      />

      <div className="app-main-row flex flex-1 min-h-0 overflow-hidden">
        <ProjectsSidebar
          projects={projectsState.projects}
          activeProjectId={projectsState.activeProjectId}
          onSelectProject={setActiveProjectId}
          onCreateProject={createProject}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
        />

        <div className="flex flex-1 overflow-hidden">
          <Canvas
            ref={canvasRef}
            layout={activeLayout}
            trackSystem={activeTrackSystem}
            onUpdateLayout={updateActiveProjectLayout}
            onSelectedItemChange={setSelectedItemId}
            onSelectedEndpointsChange={setSelectedEndpoints}
          />
        </div>

        <ComponentsSidebar trackSystem={activeTrackSystem} onComponentClick={handleComponentClick} />
      </div>
    </div>
  )
}

export default App
