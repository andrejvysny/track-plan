# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the React+TypeScript app: `main.tsx` bootstraps `App.tsx`, `styles/` and `index.css` cover styling, `components/` contains UI pieces (canvas, sidebar, toolbar), and `geometry/`, `data/`, `state/`, `hooks/`, `utils/`, `constants/`, `types/`, and `export/` group domain logic.
- Static assets live in `public/`; Vite copies them verbatim into `dist/` during `npm run build`. The generated site is published from `dist/` and mirrored under the empty `track-plan/` directory for GH Pages routing.
- The `src/export` folder calculates SVG output, while `src/geometry` models track components; keep exports focused on presentation layers, helpers, or utility hooks.

## Build, Test, and Development Commands
- `npm install`: install Node dependencies (Node 18+ recommended).
- `npm run dev`: start Vite dev server with HMR at `http://localhost:5173`.
- `npm run build`: run `tsc -b` and then `vite build` to emit the production bundle in `dist/`.
- `npm run preview`: serve the production build locally for a final sanity check.
- `npm run lint`: run ESLint via the shared config; fix issues before merging.

## Coding Style & Naming Conventions
- Follow TypeScript + React best practices: prefer functional components, keep hooks in `hooks/`, and declare shared types/settings under `types/` or `constants/`.
- ESLint + Prettier enforce formatting; rely on your editor or `npm run lint -- --fix` to keep files consistent.
- Use camelCase for variables/functions, PascalCase for components, and keep filenames aligned with exported members (e.g., `CanvasToolbar.tsx` exports `CanvasToolbar`).

## Testing Guidelines
- No automated tests exist yet; rely on manual checks via `npm run dev` or `npm run preview` and visual verification on the canvas.
- When adding future tests, place them alongside the code they cover (e.g., `src/utils/geometry.test.ts`) and name files `[subject].test.ts`.
- Aim for coverages that exercise track placement, snapping, and SVG export logic once a framework (Jest, Vitest) is introduced.

## Commit & Pull Request Guidelines
- Commits follow conventional prefixes: `feat:`, `fix:`, `chore:`, etc. Keep descriptions short and imperative (e.g., `feat: add GH Pages base path`).
- PRs should include a descriptive summary, mention related issues or deployment considerations, and attach screenshots if UI changes are introduced.
- Ensure linting succeeds locally (`npm run lint`) before requesting review and rebuild `npm run build` if files in `src/` or `public/` were altered.

## Security & Configuration Tips
- Secrets are not stored here; the static site lives on GitHub Pages. Keep API keys or private configs out of the repo.
- The `homepage` field points to `https://andrejvysny.github.io/track-plan`; update it if deployment target changes and rerun `npm run build`.
