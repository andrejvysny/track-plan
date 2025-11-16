# Repository Guidelines

## Project Structure & Module Organization
`src/` holds the React entry points (`main.tsx`, `App.tsx`), reusable UI (`components/`), state helpers (`state/`), type definitions (`types/`), Sidebars/geometry scaffolding, and styles (`styles/`, `index.css`). `public/` hosts the static manifest assets that just get copied into the build. `dist/` is the output folder created by `npm run build`; avoid committing to it. Configuration lenses live at the repo root (`tsconfig.*.json`, `vite.config.ts`, `tailwind.config.js`, `eslint.config.js`).

## Build, Test, and Development Commands
- `npm install` – installs the pinned dependencies for React 19, Vite, Tailwind v4 and tooling.
- `npm run dev` – starts Vite’s dev server (hot reload, Tailwind preprocessing) for local experimentation.
- `npm run build` – runs `tsc -b` for type checking and then `vite build` to emit a production `dist/`.
- `npm run preview` – serves the production bundle locally for a sanity check before deployment.
- `npm run lint` – runs ESLint configured via `eslint.config.js` (extends TypeScript + React + Prettier); use before commits.

## Coding Style & Naming Conventions
Use TypeScript + React conventions: PascalCase for components (e.g., `TrackSystemDefinition`), camelCase for functions/props, and `use` prefix for custom hooks (`useProjectStore`). Constants and enums live in `src/constants/` or `src/data/` and use SCREAMING_SNAKE_CASE. Keep indentation at two spaces, prefer single quotes for strings, and rely on Prettier defaults—so formatting changes should be limited to meaningful logic edits. Tailwind class order is project-preferred (group layout, spacing, colors) to keep utility blocks predictable.

## Testing Guidelines
There is no automated test suite yet; the current safety net is the type-aware build (`npm run build`) and ESLint. When adding logic, verify behavior in `npm run dev` and, if relevant, commit new unit/integration tests under a future `tests/` or `src/__tests__/` directory while following the naming pattern `*.test.ts[x]`.

## Commit & Pull Request Guidelines
The repo does not yet have a commit history, but we follow standard practices: write short, imperative summaries (~50 characters) and include a body when extra context is needed. For PRs, describe the change, link issue numbers (e.g., `Fixes #123`), and attach relevant screenshots or export logs for UI work. Run lint/build before opening a PR and reference any manual verification steps you performed.
