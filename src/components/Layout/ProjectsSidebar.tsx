import type { Project } from '../../types/project'

interface ProjectsSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  onSelectProject: (id: string) => void
  onCreateProject: () => void
  onRenameProject: (id: string) => void
  onDeleteProject: (id: string) => void
}

export function ProjectsSidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
}: ProjectsSidebarProps) {
  return (
    <aside className="sidebar-left w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Projects</span>
        <button
          type="button"
          onClick={onCreateProject}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 transition hover:border-gray-400 hover:bg-gray-100"
        >
          New
        </button>
      </header>

      <ul className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {projects.map((project) => {
          const isActive = project.id === activeProjectId
          return (
            <li key={project.id}>
              <div
                className={`group flex flex-col rounded border px-3 py-3 transition ${
                  isActive
                    ? 'border-blue-300 bg-blue-50 text-blue-900'
                    : 'border-transparent bg-white text-slate-900 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="flex-1 text-left text-sm font-medium"
                    onClick={() => onSelectProject(project.id)}
                  >
                    {project.name}
                  </button>
                  <div className="flex gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => onRenameProject(project.id)}
                      className="rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-600 transition hover:bg-blue-100"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteProject(project.id)}
                      className="rounded bg-red-50 px-2 py-0.5 font-semibold text-red-600 transition hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Updated {new Date(project.updatedAt).toLocaleString()}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
