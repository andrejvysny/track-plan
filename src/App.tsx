import type { ChangeEventHandler } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TrackComponentDefinition, TrackComponentType } from './types/trackSystem'
import { pikoA_H0 } from './data/pikoA_H0'
import { Canvas, type CanvasHandle } from './components/Layout/Canvas'
import { ComponentsSidebar } from './components/Layout/ComponentsSidebar'
import { ProjectsSidebar } from './components/Layout/ProjectsSidebar'
import { TopToolbar } from './components/Layout/TopToolbar'
import { TrackUsageCounter } from './components/Layout/TrackUsageCounter'
import { useProjectsState } from './state/projectsState'
import { buildLayoutSvgString } from './export/exportSvg'
import type { EndpointRef } from './types/trackSystem'
import type { ShapeType } from './types/layout'
import { ROTATION_STEP_DEG } from './constants/layout'
import { TRACK_COMPONENT_TYPES } from './constants/trackUsage'
import type { TrackUsageComponentCount, TrackUsageSummary } from './types/trackUsage'
import { connectionMatchesEndpoints } from './utils/connectionUtils'
import { buildProjectExport, parseProjectImport } from './utils/projectSerialization'

function App() {
  const {
    projectsState,
    activeProject,
    setActiveProjectId,
    createProject,
    renameProject,
    deleteProject,
    updateActiveProjectLayout,
    reloadFromLocalStorage,
    undo,
    redo,
    canUndo,
    canRedo,
    addImportedProject,
  } = useProjectsState()

  const activeLayout = activeProject?.layout ?? null
  const canvasRef = useRef<CanvasHandle | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [selectedEndpoints, setSelectedEndpoints] = useState<EndpointRef[]>([])
  const [debugMode, setDebugMode] = useState(false)
  const [showColors, setShowColors] = useState(true)
  const [drawingTool, setDrawingTool] = useState<ShapeType | null>(null)

  const activeTrackSystem = useMemo(() => {
    const system = activeLayout?.trackSystems.find((system) => system.id === activeLayout.activeTrackSystemId) ?? null
    // Always use the fresh definition for Piko A H0 to ensure we have the latest metadata (colors, etc)
    if (system?.id === pikoA_H0.id) {
      return pikoA_H0
    }
    return system
  }, [activeLayout])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      // Ignore if content editable is focused (e.g. text shape editor)
      if ((event.target as HTMLElement).isContentEditable) {
        return
      }

      const isMod = event.ctrlKey || event.metaKey
      const isShift = event.shiftKey

      if (isMod && !isShift && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (canUndo) undo()
      }

      if ((isMod && isShift && event.key.toLowerCase() === 'z') || (isMod && event.key.toLowerCase() === 'y')) {
        event.preventDefault()
        if (canRedo) redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canUndo, canRedo, undo, redo])

  const trackUsageSummary = useMemo<TrackUsageSummary>(() => {
    const countsByType = TRACK_COMPONENT_TYPES.reduce<Record<TrackComponentType, number>>((acc, type) => {
      acc[type] = 0
      return acc
    }, {} as Record<TrackComponentType, number>)

    if (!activeLayout || !activeTrackSystem) {
      return {
        totalCount: 0,
        countsByType,
        componentCounts: [],
      }
    }

    const componentCountMap = new Map<string, TrackUsageComponentCount>()

    activeTrackSystem.components.forEach((component) => {
      componentCountMap.set(component.id, {
        componentId: component.id,
        label: component.label,
        type: component.type,
        article: component.article,
        count: 0,
      })
    })

    activeLayout.placedItems.forEach((item) => {
      const existingEntry = componentCountMap.get(item.componentId)
      const type = existingEntry?.type ?? 'other'
      countsByType[type] += 1

      if (existingEntry) {
        existingEntry.count += 1
      } else {
        componentCountMap.set(item.componentId, {
          componentId: item.componentId,
          label: item.componentId,
          type,
          count: 1,
        })
      }
    })

    const componentCounts = Array.from(componentCountMap.values()).filter((entry) => entry.count > 0)

    return {
      totalCount: activeLayout.placedItems.length,
      countsByType,
      componentCounts,
    }
  }, [activeLayout, activeTrackSystem])

  const { totalCount: usageTotalCount, countsByType, componentCounts } = trackUsageSummary

  const selectedItems = useMemo(
    () => activeLayout?.placedItems.filter((item) => selectedItemIds.has(item.id)) ?? [],
    [activeLayout, selectedItemIds],
  )
  const selectedItemsConnected = useMemo(() => {
    if (selectedItemIds.size === 0 || !activeLayout) return false
    return Boolean(
      activeLayout.connections?.some((connection) =>
        connection.endpoints.some((endpoint) => selectedItemIds.has(endpoint.itemId)),
      ),
    )
  }, [activeLayout, selectedItemIds])
  const isSelectionGrounded = selectedItems.some((item) => item.isGrounded)

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
      connections: [],
      shapes: [],
    }))
  }

  const buildFileName = (name: string, extension: string) => {
    const safeBase = name.trim().replace(/[^a-z0-9-_]+/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
    const fallback = safeBase.length > 0 ? safeBase : 'project'
    return `${fallback}.${extension}`
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
    a.download = buildFileName(activeProject.name ?? 'layout', 'svg')
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportProjectJson = () => {
    if (!activeProject) {
      window.alert('No project selected to export.')
      return
    }

    const exportString = buildProjectExport(activeProject)
    const blob = new Blob([exportString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = buildFileName(activeProject.name ?? 'project', 'json')
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportRequest = () => {
    importInputRef.current?.click()
  }

  const handleImportFile: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      const parsed = parseProjectImport(content)
      if (!parsed.ok) {
        window.alert(`Import failed: ${parsed.error}`)
        return
      }

      addImportedProject(parsed.project)
    } catch (error) {
      console.error('Failed to import project', error)
      window.alert('Failed to import project. Please check the console for details.')
    } finally {
      event.target.value = ''
    }
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

  const handleDisconnectEndpoints = () => {
    canvasRef.current?.disconnectSelectedEndpoints()
  }

  const handleDeleteSelected = () => {
    canvasRef.current?.deleteSelectedItem()
  }

  const handleDimensionAction = (type: 'center' | 'inner' | 'outer' = 'center') => {
    const created = canvasRef.current?.addDimensionBetweenSelectedTracks(type) ?? false
    if (created) {
      setDrawingTool(null)
    }
    return created
  }

  const handleToggleGrounded = () => {
    if (selectedItemIds.size === 0) return
    updateActiveProjectLayout((layout) => ({
      ...layout,
      placedItems: layout.placedItems.map((item) =>
        selectedItemIds.has(item.id) ? { ...item, isGrounded: !item.isGrounded } : item,
      ),
    }))
  }

  const canRotateSelection = selectedItemIds.size > 0 && !selectedItemsConnected && !isSelectionGrounded
  // Note: Shape deletion is handled internally by Canvas, so we only check for item selection here
  const canDeleteSelection = selectedItemIds.size > 0
  const canConnectEndpoints = selectedEndpoints.length === 2
  const canDisconnectEndpoints = useMemo(() => {
    if (!activeLayout) return false
    if (selectedEndpoints.length !== 2) return false
    return Boolean(
      activeLayout.connections?.some((connection) =>
        connectionMatchesEndpoints(connection, selectedEndpoints),
      ),
    )
  }, [activeLayout, selectedEndpoints])
  const canToggleGroundSelection = selectedItemIds.size > 0

  return (
    <div className="app-root flex h-screen flex-col bg-slate-950 text-slate-100">
      <TopToolbar
        activeProject={activeProject}
        onNewProject={createProject}
        onReload={reloadFromLocalStorage}
        onResetLayout={handleResetLayout}
        onExportSvg={handleExportSvg}
        onExportJson={handleExportProjectJson}
        onImport={handleImportRequest}
        onConnectEndpoints={handleConnectEndpoints}
        onDisconnectEndpoints={handleDisconnectEndpoints}
        onRotateSelectedLeft={() => handleRotateSelected(-ROTATION_STEP_DEG)}
        onRotateSelectedRight={() => handleRotateSelected(ROTATION_STEP_DEG)}
        onDeleteSelected={handleDeleteSelected}
        onToggleGrounded={handleToggleGrounded}
        onUndo={undo}
        onRedo={redo}
        onToggleDebug={() => setDebugMode((prev) => !prev)}
        showColors={showColors}
        onToggleColors={() => setShowColors((prev) => !prev)}
        canConnectEndpoints={canConnectEndpoints}
        canDisconnectEndpoints={canDisconnectEndpoints}
        canRotateSelection={canRotateSelection}
        canDeleteSelection={canDeleteSelection}
        canUndo={canUndo}
        canRedo={canRedo}
        canToggleGroundSelection={canToggleGroundSelection}
        isSelectionGrounded={isSelectionGrounded}
        canExportProject={Boolean(activeProject)}
        debugMode={debugMode}
        drawingTool={drawingTool}
        onDrawingToolChange={setDrawingTool}
        onDimensionAction={handleDimensionAction}
      />

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFile}
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
            onSelectionChange={(ids) => setSelectedItemIds(new Set(ids))}
            onSelectedEndpointsChange={setSelectedEndpoints}
            debugMode={debugMode}
            showColors={showColors}
            drawingTool={drawingTool}
            undo={undo}
            redo={redo}
          />
        </div>

        <ComponentsSidebar trackSystem={activeTrackSystem} onComponentClick={handleComponentClick} />
      </div>
      <TrackUsageCounter
        totalCount={usageTotalCount}
        typeCounts={countsByType}
        componentCounts={componentCounts}
      />
    </div>
  )
}

export default App
