# Track Planner

Track Planner is a browser-based layout editor for H0 model railway systems. It runs fully in the browser, keeps every project in `localStorage` (plus optional export/import), and ships with a complete catalog of PIKO A-Gleis H0 components.

## Key Features
- **Project workspace**: create, rename, swap, and delete layouts while the runtime keeps each project’s timestamp and connections. You can export a project as JSON, reimport it, or fetch a rendered SVG for documentation.
- **Interactive canvas**: drag-and-drop track pieces, rotate items in 15° increments, and snap endpoints automatically (8 mm / 15° tolerance). Selected tracks move together while connections stay intact, and grounded items stay fixed.
- **Utility tools**: use drawing tools for rectangles, circles, free text, or automated dimension lines (inner/outer/center) plus a compact debug mode that visualizes endpoints, vectors, and connector names.
- **Track usage counter**: an expandable overlay shows total placed pieces, breakdown by type, and per-component counts (label + article number) so you can keep an inventory while designing.
- **Undo/redo + keyboard shortcuts**: standard `Ctrl/Cmd+Z` and `Shift+Ctrl/Cmd+Z` support; the toolbar also exposes rotate, delete, connect/disconnect, grounding, export, and import controls.

## Technology Stack
- React 19 + Vite 7 for the UI shell and fast HMR.
- TypeScript 5.9 with strict type definitions under `src/types`.
- Tailwind CSS 4 (via `@tailwindcss/vite`) for styling.
- ESLint + Prettier (configured in `eslint.config.js`) ensure consistent formatting.

## Getting Started
### Prerequisites
- Node.js 18+ (npm ships with Node and is required for the scripts).

### Installation
```bash
npm install
```

### Available commands
- `npm run dev`: starts the Vite dev server (`http://localhost:5173` by default) with fast refresh.
- `npm run build`: runs `tsc -b` followed by `vite build` to emit the production bundle into `dist/`.
- `npm run preview`: serves the production output locally for a final check.
- `npm run lint`: runs ESLint across the repository; fix any warnings/errors before merging.

## Project Layout
- `src/main.tsx` bootstraps the app, `src/App.tsx` wires the canvas, sidebars, and toolbar.
- `src/components/Layout/` holds visual pieces (canvas, toolbars, sidebars, track usage overlay).
- Domain logic resides in `src/geometry/`, `src/export/`, `src/state/`, `src/utils/`, and `src/data/` (PIKO H0 definitions).
- Shared concerns go under `src/constants/`, `src/types/`, `src/hooks/`, and `src/utils/`.
- `public/` keeps static assets copied by Vite; `dist/` is the build output published to GitHub Pages via the configured `homepage`.

## Deployment Notes
- The project publishes to `https://andrejvysny.github.io/track-plan`; keep the `homepage` field in `package.json` in sync if the base path changes.
- Every `npm run build` output is ready for deployment; `vite preview` lets you verify the bundle locally before publishing.
