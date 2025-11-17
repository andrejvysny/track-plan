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
    <aside className="sidebar-left w-64 border-r border-slate-800 bg-slate-950 flex flex-col text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Projects</span>
        <button
          type="button"
          onClick={onCreateProject}
          className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-900/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500/60"
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
                    ? 'border-blue-600/80 bg-slate-900 text-slate-100'
                    : 'border-transparent bg-slate-950 text-slate-200 hover:border-slate-700 hover:bg-slate-900'
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
                      className="rounded bg-blue-900 px-2 py-0.5 font-semibold text-blue-300 transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400/60"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteProject(project.id)}
                      className="rounded bg-red-900 px-2 py-0.5 font-semibold text-red-300 transition hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
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
