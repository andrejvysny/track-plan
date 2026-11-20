# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Vite dev server (HMR) — http://localhost:5173
npm run build     # tsc -b (project refs) + vite build → dist/
npm run lint      # ESLint (flat config)
npm run preview   # Serve production build locally
```

Use **npm**: lockfile is `package-lock.json` and CI runs `npm ci`. The `packageManager: yarn@4.x` field in `package.json` is stale — ignore it.

No test framework. No pre-commit hooks. Validate changes manually via `npm run dev`. `npm run build` is the real type-check gate (`noUnusedLocals`/`noUnusedParameters`/`erasableSyntaxOnly` are on across two project-reference tsconfigs: `tsconfig.app.json` for `src/`, `tsconfig.node.json` for `vite.config.ts`).

## Architecture

**Track Planner** — browser-only H0-scale railway layout editor. React 19 + Vite 7 + TypeScript strict + Tailwind CSS 4 (alpha). Dark theme. No backend; everything lives in `localStorage` plus JSON/SVG export. Deployed to GitHub Pages at base `/track-plan/` (`vite.config.ts`).

**`App.tsx` is the hub.** No external state library — `useProjectsState()` owns all persistent state; App holds ephemeral UI state (`viewMode`, `selectedItemIds`, `selectedEndpoints`, `debugMode`, `drawingTool`, per-project camera) and flows everything to children via props/callbacks.

### Dual rendering: 2D ⇄ 3D

App toggles `viewMode` `'2d' | '3d'` (TopToolbar button). The two canvases are independent renderers over the **same `LayoutState`**:

- **2D — `Canvas.tsx`** (~2000 lines, SVG). The interaction surface: drag, snap, rotate, connect/disconnect endpoints, draw shapes, dimensions, grounding, debug overlay. Exposes a `CanvasHandle` imperative API (`rotateSelected`, `connect/disconnectSelectedEndpoints`, `deleteSelectedItem`, `addDimensionBetweenSelectedTracks`) via `forwardRef`/`useImperativeHandle`; App's toolbar buttons call through `canvasRef`. Rendering is split into `canvas/` subcomponents: `TrackItemRenderer`, `ShapeRenderer`, `DrawingPreview`.
- **3D — `Canvas3D.tsx`** (`@react-three/fiber` + `@react-three/drei` + `three`), **lazy-loaded** behind `Suspense`. Read-mostly: orbit camera, click-to-select, plus the **elevation** editor (`ElevationPanel`). `frameloop="demand"`, DPR throttled during interaction, dev-only perf HUD. Subcomponents in `canvas3d/`: `TrackScene` → `TrackPiece3D` (per item) + `GlobalTies` + `ConnectionIndicators`; `Baseboard`, `TrackLabels`, `ElevationPanel`, `sceneBounds.ts` (camera-fit bounds).

Endpoint connect/disconnect is **2D-only** (`canConnectEndpoints` etc. gate on `viewMode === '2d'`). Selection is shared across both views.

### Coordinate systems (critical)

- **2D / data model: all coordinates in millimeters** (real H0 scale), SVG space `(x, y)`.
- **3D derives geometry from the 2D SVG path.** `trackGeometry3D.ts` calls `getComponentGeometry(def).buildPathD()` to get the SVG `d` string, then `parseSvgPath()` re-parses `M`/`L`/`A` commands into 3D curves. There is **one source of geometry truth** (`trackGeometry.ts`); the 3D layer is a consumer, not a parallel implementation — change track shapes there.
- **Axis mapping: SVG `(x, y)` → Three.js `(x, elevation, z)`.** SVG-Y becomes Three-**Z**; Three-**Y is up = elevation**. Rails are offset ±`HALF_GAUGE_MM` (8.25mm; H0 gauge 16.5mm) from the centerline.

### Elevation

`PlacedItem.connectorElevationsMm?: Record<connectorKey, mm>` (Y heights, edited only in 3D). On edit, `propagateConnectorElevations` / `propagateElevation` (`utils/elevationUtils.ts`) **BFS through `connections`** so connected endpoints share a height. `applyElevationToCurves` lifts the 3D curves; 0 = baseboard.

### State (`src/state/projectsState.ts`)

- `useReducer`-based. **Undo/redo is per-project** (`historyMap[projectId]`, 60-entry stacks), not a single global stack.
- Persistence: debounced 300ms write to localStorage key `'track-planner-projects-v1'`. **Only `{ projects, activeProjectId }` is persisted** — `historyMap` and the per-project 3D camera (`cameraByProjectId` in App, in-memory) are NOT.
- `updateActiveProjectLayout(updater, { recordHistory })` is the single mutation path; clones via `cloneLayoutState` before pushing history.
- Catalog gotcha: a layout stores its own `trackSystems[]`, but App **always re-resolves the live `pikoA_H0`** for the active system (`App.tsx`) so catalog edits (colors/metadata) take effect without re-importing. Edit the catalog in `data/pikoA_H0.ts`, not stored copies.

### Layout data model (`src/types/layout.ts`)

`LayoutState`: `placedItems[]` (track instances: `componentId`, `x`, `y`, `rotationDeg`, `isGrounded?`, `connectorElevationsMm?`), `connections[]` (pairs of `EndpointRef`), `shapes[]` (`rectangle | circle | text | dimension`), `trackSystems[]`, `activeTrackSystemId`. Endpoints are `itemId + connectorKey` (`'start' | 'end' | custom`, e.g. switch branch keys).

### Geometry & data

- `geometry/trackGeometry.ts` — **single source** of component geometry, transforms, the SVG `buildPathD()`. `trackEndpoint.ts` — endpoint world transforms. `geometryUtils.ts` — vector math (track width 28mm). `trackGeometry3D.ts` + `trackGeometryCache3D.ts` — 3D curves + cached `TubeGeometry`/tie placement (cache key from def shape fields; `clearTrackGeometryCache()` disposes).
- `constants/` — `layout.ts` (`SNAP_DISTANCE_MM=8`, `ROTATION_STEP_DEG=15`, rendering sizes), `pikoGeometry.ts` (R9 radius/angle for switch detection), `trackUsage.ts`.
- `data/pikoA_H0.ts` — full PIKO A-Gleis H0 catalog (real dims, article numbers, colors). `demoTrackSystem.json` — sample.
- `export/exportSvg.ts` — standalone SVG (opened in new tab) with optional track-usage table. `utils/projectSerialization.ts` — JSON import/export (validated).

### UI

3-column flex: `ProjectsSidebar | Canvas(2D/3D) | ComponentsSidebar`; `TopToolbar` above, `TrackUsageCounter` overlay below. Undo/redo keyboard: `Ctrl/Cmd+Z`, `Shift+Ctrl/Cmd+Z` / `Ctrl+Y` (handled in `App.tsx`, ignored while typing in inputs/contentEditable).

## Conventions

- Functional components + hooks only. No `any`; strict interfaces for every domain object.
- Prettier: single quotes, semicolons, 2-space, 100 col, ES5 trailing commas. ESLint flat config (typescript-eslint + react-hooks + react-refresh + prettier).
- Match existing patterns; keep `trackGeometry.ts` the only place track shapes are defined.
- Commits: conventional prefixes (`feat:`, `fix:`, `chore:`), short imperative. Deploy is automatic on push to `master` (`.github/workflows/deploy.yml` → builds, publishes `dist/` to `gh-pages`); keep `base`/`homepage` in sync if the path changes.
