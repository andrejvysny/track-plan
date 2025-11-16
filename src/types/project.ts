import type { LayoutState } from './layout'

const CURRENT_DATE_ISO = () => new Date().toISOString()

function generateProjectId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `project-${Math.random().toString(36).slice(2, 10)}`
}

function cloneLayoutState(layout: LayoutState): LayoutState {
  if (typeof structuredClone === 'function') {
    return structuredClone(layout)
  }

  return JSON.parse(JSON.stringify(layout))
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  layout: LayoutState
}

export function createNewProject(name: string, baseLayout: LayoutState): Project {
  const timestamp = CURRENT_DATE_ISO()

  return {
    id: generateProjectId(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    layout: cloneLayoutState(baseLayout),
  }
}
