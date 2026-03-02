import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Project } from '../types/project';
import type { LayoutState } from '../types/layout';
import { createNewProject } from '../types/project';
import { createDefaultLayoutState } from './layoutState';
import { cloneLayoutState } from '../utils/cloneLayout';
import type { ProjectImportData } from '../utils/projectSerialization';

export interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;
}

const STORAGE_KEY = 'track-planner-projects-v1';
const MAX_HISTORY_ENTRIES = 60;

type LayoutHistory = {
  undoStack: LayoutState[];
  redoStack: LayoutState[];
};

type CombinedState = {
  projects: Project[];
  activeProjectId: string | null;
  historyMap: Record<string, LayoutHistory>;
};

type Action =
  | {
      type: 'UPDATE_LAYOUT';
      updater: (layout: LayoutState) => LayoutState;
      recordHistory: boolean;
    }
  | { type: 'REPLACE_PROJECTS'; state: ProjectsState }
  | { type: 'SET_ACTIVE_PROJECT'; id: string }
  | { type: 'CREATE_PROJECT'; project: Project }
  | { type: 'ADD_IMPORTED_PROJECT'; project: Project }
  | { type: 'RENAME_PROJECT'; id: string; name: string }
  | { type: 'DELETE_PROJECT'; id: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RELOAD'; state: ProjectsState };

const emptyHistory: LayoutHistory = { undoStack: [], redoStack: [] };

function getActiveProject(state: CombinedState): Project | null {
  return state.projects.find((p) => p.id === state.activeProjectId) ?? null;
}

function getHistory(state: CombinedState, projectId: string): LayoutHistory {
  return state.historyMap[projectId] ?? emptyHistory;
}

function reducer(state: CombinedState, action: Action): CombinedState {
  switch (action.type) {
    case 'UPDATE_LAYOUT': {
      if (!state.activeProjectId) return state;
      const activeId = state.activeProjectId;
      const currentProject = state.projects.find((p) => p.id === activeId);
      if (!currentProject) return state;

      const nextHistory = action.recordHistory
        ? {
            undoStack: [
              cloneLayoutState(currentProject.layout),
              ...getHistory(state, activeId).undoStack,
            ].slice(0, MAX_HISTORY_ENTRIES),
            redoStack: [],
          }
        : state.historyMap[activeId];

      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === activeId
            ? {
                ...p,
                layout: action.updater(p.layout),
                updatedAt: new Date().toISOString(),
              }
            : p
        ),
        historyMap: nextHistory
          ? { ...state.historyMap, [activeId]: nextHistory }
          : state.historyMap,
      };
    }

    case 'UNDO': {
      if (!state.activeProjectId) return state;
      const activeId = state.activeProjectId;
      const currentProject = state.projects.find((p) => p.id === activeId);
      if (!currentProject) return state;
      const history = getHistory(state, activeId);
      if (history.undoStack.length === 0) return state;

      const [latest, ...remainingUndo] = history.undoStack;
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === activeId ? { ...p, layout: latest, updatedAt: new Date().toISOString() } : p
        ),
        historyMap: {
          ...state.historyMap,
          [activeId]: {
            undoStack: remainingUndo,
            redoStack: [cloneLayoutState(currentProject.layout), ...history.redoStack].slice(
              0,
              MAX_HISTORY_ENTRIES
            ),
          },
        },
      };
    }

    case 'REDO': {
      if (!state.activeProjectId) return state;
      const activeId = state.activeProjectId;
      const currentProject = state.projects.find((p) => p.id === activeId);
      if (!currentProject) return state;
      const history = getHistory(state, activeId);
      if (history.redoStack.length === 0) return state;

      const [nextEntry, ...remainingRedo] = history.redoStack;
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === activeId ? { ...p, layout: nextEntry, updatedAt: new Date().toISOString() } : p
        ),
        historyMap: {
          ...state.historyMap,
          [activeId]: {
            undoStack: [cloneLayoutState(currentProject.layout), ...history.undoStack].slice(
              0,
              MAX_HISTORY_ENTRIES
            ),
            redoStack: remainingRedo,
          },
        },
      };
    }

    case 'SET_ACTIVE_PROJECT':
      return { ...state, activeProjectId: action.id };

    case 'CREATE_PROJECT':
      return {
        ...state,
        projects: [...state.projects, action.project],
        activeProjectId: action.project.id,
        historyMap: {
          ...state.historyMap,
          [action.project.id]: emptyHistory,
        },
      };

    case 'ADD_IMPORTED_PROJECT':
      return {
        ...state,
        projects: [...state.projects, action.project],
        activeProjectId: action.project.id,
        historyMap: {
          ...state.historyMap,
          [action.project.id]: emptyHistory,
        },
      };

    case 'RENAME_PROJECT':
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.id ? { ...p, name: action.name, updatedAt: new Date().toISOString() } : p
        ),
      };

    case 'DELETE_PROJECT': {
      const remaining = state.projects.filter((p) => p.id !== action.id);
      const nextActive =
        state.activeProjectId === action.id ? (remaining[0]?.id ?? null) : state.activeProjectId;
      const nextHistoryMap = { ...state.historyMap };
      delete nextHistoryMap[action.id];
      return {
        ...state,
        projects: remaining,
        activeProjectId: nextActive,
        historyMap: nextHistoryMap,
      };
    }

    case 'REPLACE_PROJECTS':
      return {
        ...state,
        projects: action.state.projects,
        activeProjectId: action.state.activeProjectId,
      };

    case 'RELOAD':
      return {
        projects: action.state.projects,
        activeProjectId: action.state.activeProjectId,
        historyMap: {},
      };

    default:
      return state;
  }
}

function readStoredState(): ProjectsState | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as ProjectsState;
  } catch {
    return null;
  }
}

function createInitialState(): CombinedState {
  const stored = readStoredState();
  const base =
    stored ??
    (() => {
      const project = createNewProject('Project 1', createDefaultLayoutState());
      return { projects: [project], activeProjectId: project.id };
    })();
  return { ...base, historyMap: {} };
}

export function useProjectsState() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  // Debounced localStorage persistence (300ms) to avoid hammering during rapid edits
  const isFirstRender = useRef(true);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      try {
        const toStore: ProjectsState = {
          projects: state.projects,
          activeProjectId: state.activeProjectId,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
      } catch (error) {
        console.warn('Unable to persist projects to localStorage', error);
      }
    }, 300);
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [state.projects, state.activeProjectId]);

  const projectsState: ProjectsState = useMemo(
    () => ({ projects: state.projects, activeProjectId: state.activeProjectId }),
    [state.projects, state.activeProjectId]
  );

  const activeProject = useMemo(() => getActiveProject(state), [state]);

  const activeHistory = state.activeProjectId
    ? getHistory(state, state.activeProjectId)
    : emptyHistory;
  const canUndo = activeHistory.undoStack.length > 0;
  const canRedo = activeHistory.redoStack.length > 0;

  const updateActiveProjectLayout = useCallback(
    (updater: (layout: LayoutState) => LayoutState, options?: { recordHistory?: boolean }) => {
      dispatch({
        type: 'UPDATE_LAYOUT',
        updater,
        recordHistory: options?.recordHistory !== false,
      });
    },
    []
  );

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  const setActiveProjectId = useCallback(
    (id: string) => dispatch({ type: 'SET_ACTIVE_PROJECT', id }),
    []
  );

  const createProject = useCallback(() => {
    const project = createNewProject(
      `Project ${state.projects.length + 1}`,
      createDefaultLayoutState()
    );
    dispatch({ type: 'CREATE_PROJECT', project });
  }, [state.projects.length]);

  const addImportedProject = useCallback((imported: ProjectImportData) => {
    const baseProject = createNewProject(imported.name, imported.layout);
    const project: Project = {
      ...baseProject,
      name: imported.name,
      createdAt: imported.createdAt ?? baseProject.createdAt,
      updatedAt: new Date().toISOString(),
      layout: baseProject.layout,
    };
    dispatch({ type: 'ADD_IMPORTED_PROJECT', project });
  }, []);

  const renameProject = useCallback(
    (id: string, newName: string) => dispatch({ type: 'RENAME_PROJECT', id, name: newName }),
    []
  );

  const deleteProject = useCallback((id: string) => dispatch({ type: 'DELETE_PROJECT', id }), []);

  const reloadFromLocalStorage = useCallback(() => {
    const stored = readStoredState();
    if (stored) {
      dispatch({ type: 'RELOAD', state: stored });
    }
  }, []);

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
  };
}
