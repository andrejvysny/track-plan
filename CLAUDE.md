# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Type-check (tsc -b) + Vite build
npm run lint      # ESLint (flat config)
npm run preview   # Serve production build locally
```

No test framework configured. No pre-commit hooks.

## Architecture

**Track Planner** — browser-based H0 scale railway layout editor. React 19 + Vite 7 + TypeScript strict + Tailwind CSS 4 (alpha). Dark theme. Deployed to GitHub Pages at `/track-plan/`.

### State

- `useProjectsState()` (`src/state/projectsState.ts`) — central hook managing projects array, active project, undo/redo (60-entry stacks). Persists to localStorage key `'track-planner-projects-v1'` via custom `useLocalStorageState` hook.
- No external state library. All state flows through App.tsx → child components via props/callbacks.
- State updates clone before mutation (`cloneLayoutState`).

### Layout data model (`src/types/layout.ts`)

`LayoutState` contains: `placedItems[]` (track instances), `connections[]` (endpoint pairs), `shapes[]` (annotations: rect/circle/text/dimension), `activeTrackSystemId`.

### Rendering

- **All coordinates in millimeters** (real H0 scale).
- SVG-based rendering in `Canvas.tsx` (~900 lines) — handles drag, snap, rotate, connect, shape drawing.
- Canvas exposes imperative handle via `forwardRef`/`useImperativeHandle` (connect, rotate, delete, addDimension).
- Snap tolerance: 8mm position, 15° rotation (`ROTATION_STEP_DEG`).

### Geometry (`src/geometry/`)

- `trackGeometry.ts` — component geometry computation, transformations, rotations.
- `trackEndpoint.ts` — endpoint connection transforms.
- `geometryUtils.ts` — vector math, constants (track width = 28mm).
- Endpoints identified by `itemId + connectorKey` (start|end|custom).

### Track data (`src/data/`)

- `pikoA_H0.ts` — complete PIKO A-Gleis H0 catalog (~500 components with real dimensions, article numbers, colors).

### UI layout

3-column flexbox: ProjectsSidebar | Canvas | ComponentsSidebar. TopToolbar above, TrackUsageCounter overlay below.

## Conventions

- Functional React components + hooks only
- Prettier: single quotes, semicolons, 100 char width, trailing commas
- ESLint flat config with typescript-eslint + react-hooks + prettier
- Type-first: strict interfaces for all domain objects, no `any`
- `base: '/track-plan/'` in vite.config.ts for GitHub Pages
