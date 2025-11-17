import { useCallback, useMemo, useState } from 'react'
import type { Project } from '../types/project'
import type { LayoutState } from '../types/layout'
import { createNewProject } from '../types/project'
import { createDefaultLayoutState } from './layoutState'
import { useLocalStorageState } from '../hooks/useLocalStorageState'
import { cloneLayoutState } from '../utils/cloneLayout'

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
      let recordedLayout: LayoutState | null = null
      let projectId: string | null = null

      setProjectsState((previous) => {
        if (!previous.activeProjectId) {
          return previous
        }

        const activeId = previous.activeProjectId
        const updatedProjects = previous.projects.map((project) => {
          if (project.id !== activeId) {
            return project
          }

          projectId = project.id
          recordedLayout = project.layout

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

      if (options?.recordHistory === false) {
        return
      }

      if (projectId && recordedLayout) {
        pushHistoryEntry(projectId, recordedLayout)
      }
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
    redo,
    reloadFromLocalStorage,
    setActiveProjectId,
    undo,
    updateActiveProjectLayout,
  }
}
