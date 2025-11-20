import { useCallback, useMemo, useState } from 'react'
import type { Project } from '../types/project'
import type { LayoutState } from '../types/layout'
import { createNewProject } from '../types/project'
import { createDefaultLayoutState } from './layoutState'
import { useLocalStorageState } from '../hooks/useLocalStorageState'
import { cloneLayoutState } from '../utils/cloneLayout'
import type { ProjectImportData } from '../utils/projectSerialization'

export interface ProjectsState {
  projects: Project[]
  activeProjectId: string | null
}

const STORAGE_KEY = 'track-planner-projects-v1'
const MAX_HISTORY_ENTRIES = 60

type LayoutHistory = {
  undoStack: LayoutState[]
  redoStack: LayoutState[]
}

function createInitialProjectsState(): ProjectsState {
  const project = createNewProject('Project 1', createDefaultLayoutState())
  return {
    projects: [project],
    activeProjectId: project.id,
  }
}

export function useProjectsState() {
  const [projectsState, setProjectsState] = useLocalStorageState<ProjectsState>(
    STORAGE_KEY,
    createInitialProjectsState(),
  )
  const [historyMap, setHistoryMap] = useState<Record<string, LayoutHistory>>({})

  const activeProject = useMemo(
    () => projectsState.projects.find((project) => project.id === projectsState.activeProjectId) ?? null,
    [projectsState.projects, projectsState.activeProjectId],
  )

  const activeHistory = projectsState.activeProjectId
    ? historyMap[projectsState.activeProjectId] ?? { undoStack: [], redoStack: [] }
    : { undoStack: [], redoStack: [] }

  const canUndo = activeHistory.undoStack.length > 0
  const canRedo = activeHistory.redoStack.length > 0

  const pushHistoryEntry = useCallback(
    (projectId: string, layout: LayoutState) => {
      setHistoryMap((previous) => {
        const previousEntry = previous[projectId]
        const nextUndo = [cloneLayoutState(layout), ...(previousEntry?.undoStack ?? [])].slice(0, MAX_HISTORY_ENTRIES)
        return {
          ...previous,
          [projectId]: {
            undoStack: nextUndo,
            redoStack: [],
          },
        }
      })
    },
    [setHistoryMap],
  )

  const updateActiveProjectLayout = useCallback(
    (updater: (layout: LayoutState) => LayoutState, options?: { recordHistory?: boolean }) => {
      setProjectsState((previous) => {
        if (!previous.activeProjectId) {
          return previous
        }

        const activeId = previous.activeProjectId
        const currentProject = previous.projects.find((p) => p.id === activeId)

        if (!currentProject) {
          return previous
        }

        // Record history BEFORE the update if requested (default true)
        if (options?.recordHistory !== false) {
          // We need to side-effect the history update here because we need the *current* state
          // before it's overwritten. This is safe because setHistoryMap uses its own functional update
          // and doesn't depend on the render cycle for this specific value.
          pushHistoryEntry(activeId, currentProject.layout)
        }

        const updatedProjects = previous.projects.map((project) => {
          if (project.id !== activeId) {
            return project
          }

          return {
            ...project,
            layout: updater(project.layout),
            updatedAt: new Date().toISOString(),
          }
        })

        return {
          ...previous,
          projects: updatedProjects,
        }
      })
    },
    [pushHistoryEntry, setProjectsState],
  )

  const replaceActiveProjectLayout = useCallback(
    (layout: LayoutState) => {
      const nextLayout = cloneLayoutState(layout)
      setProjectsState((previous) => {
        if (!previous.activeProjectId) {
          return previous
        }

        const updatedProjects = previous.projects.map((project) =>
          project.id === previous.activeProjectId
            ? { ...project, layout: nextLayout, updatedAt: new Date().toISOString() }
            : project,
        )

        return {
          ...previous,
          projects: updatedProjects,
        }
      })
    },
    [setProjectsState],
  )

  const undo = useCallback(() => {
    const projectId = projectsState.activeProjectId
    const currentLayout = activeProject?.layout
    if (!projectId || !currentLayout) {
      return
    }

    const layoutForRedo = cloneLayoutState(currentLayout)
    setHistoryMap((previous) => {
      const history = previous[projectId]
      if (!history || history.undoStack.length === 0) {
        return previous
      }

      const [latest, ...remainingUndo] = history.undoStack
      replaceActiveProjectLayout(latest)

      const nextRedo = [layoutForRedo, ...history.redoStack].slice(0, MAX_HISTORY_ENTRIES)
      return {
        ...previous,
        [projectId]: {
          undoStack: remainingUndo,
          redoStack: nextRedo,
        },
      }
    })
  }, [projectsState.activeProjectId, activeProject?.layout, replaceActiveProjectLayout])

  const redo = useCallback(() => {
    const projectId = projectsState.activeProjectId
    const currentLayout = activeProject?.layout
    if (!projectId || !currentLayout) {
      return
    }

    const layoutForUndo = cloneLayoutState(currentLayout)
    setHistoryMap((previous) => {
      const history = previous[projectId]
      if (!history || history.redoStack.length === 0) {
        return previous
      }

      const [nextEntry, ...remainingRedo] = history.redoStack
      replaceActiveProjectLayout(nextEntry)

      const nextUndo = [layoutForUndo, ...history.undoStack].slice(0, MAX_HISTORY_ENTRIES)
      return {
        ...previous,
        [projectId]: {
          undoStack: nextUndo,
          redoStack: remainingRedo,
        },
      }
    })
  }, [projectsState.activeProjectId, activeProject?.layout, replaceActiveProjectLayout])

  const setActiveProjectId = useCallback(
    (id: string) =>
      setProjectsState((previous) => ({
        ...previous,
        activeProjectId: id,
      })),
    [setProjectsState],
  )

  const createProject = useCallback(() => {
    setProjectsState((previous) => {
      const nextProject = createNewProject(`Project ${previous.projects.length + 1}`, createDefaultLayoutState())
      setHistoryMap((historyPrevious) => ({
        ...historyPrevious,
        [nextProject.id]: { undoStack: [], redoStack: [] },
      }))

      return {
        projects: [...previous.projects, nextProject],
        activeProjectId: nextProject.id,
      }
    })
  }, [setProjectsState, setHistoryMap])

  const addImportedProject = useCallback(
    (imported: ProjectImportData) => {
      const baseProject = createNewProject(imported.name, imported.layout)
      const importedProject: Project = {
        ...baseProject,
        name: imported.name,
        createdAt: imported.createdAt ?? baseProject.createdAt,
        updatedAt: new Date().toISOString(),
        layout: baseProject.layout,
      }

      setProjectsState((previous) => ({
        ...previous,
        projects: [...previous.projects, importedProject],
        activeProjectId: importedProject.id,
      }))

      setHistoryMap((historyPrevious) => ({
        ...historyPrevious,
        [importedProject.id]: { undoStack: [], redoStack: [] },
      }))
    },
    [setProjectsState, setHistoryMap],
  )

  const renameProject = useCallback(
    (id: string, newName: string) => {
      setProjectsState((previous) => ({
        ...previous,
        projects: previous.projects.map((project) =>
          project.id === id
            ? {
              ...project,
              name: newName,
              updatedAt: new Date().toISOString(),
            }
            : project,
        ),
      }))
    },
    [setProjectsState],
  )

  const deleteProject = useCallback(
    (id: string) => {
      setProjectsState((previous) => {
        const remaining = previous.projects.filter((project) => project.id !== id)
        const nextActive =
          previous.activeProjectId === id ? remaining[0]?.id ?? null : previous.activeProjectId

        return {
          ...previous,
          projects: remaining,
          activeProjectId: nextActive,
        }
      })

      setHistoryMap((previous) => {
        if (!previous[id]) {
          return previous
        }
        const next = { ...previous }
        delete next[id]
        return next
      })
    },
    [setProjectsState, setHistoryMap],
  )

  const reloadFromLocalStorage = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        return
      }

      const parsed = JSON.parse(stored) as ProjectsState
      setHistoryMap({})
      setProjectsState(parsed)
    } catch (error) {
      console.warn('Unable to reload projects from localStorage', error)
    }
  }, [setProjectsState, setHistoryMap])

  return {
    projectsState,
    activeProject,
    canRedo,
    canUndo,
    createProject,
    deleteProject,
    renameProject,
    addImportedProject,
    redo,
    reloadFromLocalStorage,
    setActiveProjectId,
    undo,
    updateActiveProjectLayout,
  }
}
