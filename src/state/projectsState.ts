import { useCallback, useMemo } from 'react'
import type { Project } from '../types/project'
import type { LayoutState } from '../types/layout'
import { createNewProject } from '../types/project'
import { createDefaultLayoutState } from './layoutState'
import { useLocalStorageState } from '../hooks/useLocalStorageState'

export interface ProjectsState {
  projects: Project[]
  activeProjectId: string | null
}

const STORAGE_KEY = 'track-planner-projects-v1'

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

  const activeProject = useMemo(
    () => projectsState.projects.find((project) => project.id === projectsState.activeProjectId) ?? null,
    [projectsState.projects, projectsState.activeProjectId],
  )

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

      return {
        projects: [...previous.projects, nextProject],
        activeProjectId: nextProject.id,
      }
    })
  }, [setProjectsState])

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
    },
    [setProjectsState],
  )

  const updateActiveProjectLayout = useCallback(
    (updater: (layout: LayoutState) => LayoutState) => {
      setProjectsState((previous) => {
        if (!previous.activeProjectId) {
          return previous
        }

        return {
          ...previous,
          projects: previous.projects.map((project) => {
            if (project.id !== previous.activeProjectId) {
              return project
            }

            return {
              ...project,
              layout: updater(project.layout),
              updatedAt: new Date().toISOString(),
            }
          }),
        }
      })
    },
    [setProjectsState],
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
      setProjectsState(parsed)
    } catch (error) {
      console.warn('Unable to reload projects from localStorage', error)
    }
  }, [setProjectsState])

  return {
    projectsState,
    setProjectsState,
    activeProject,
    setActiveProjectId,
    createProject,
    renameProject,
    deleteProject,
    updateActiveProjectLayout,
    reloadFromLocalStorage,
  }
}
