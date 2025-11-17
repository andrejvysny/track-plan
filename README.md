# Track Planner

**Track Planner** is a browser-based H0 model railway track planning application that allows you to design track layouts using predefined track component libraries. The application provides an interactive canvas-based interface for placing track components, connecting endpoints, and exporting your designs as SVG files.

> **Note:** This project is still in active development. While core functionality is implemented and working, some features may be incomplete or subject to change.

![Track Planner preview](./README.png)

## What It Is

Track Planner is a specialized CAD-like tool for model railway enthusiasts working with H0 scale (1:87) track systems. It currently includes a complete catalog of **PIKO A-Gleis H0** components, including:

- Straight track segments (various lengths)
- Curved track segments (multiple radii and angles)
- Switches (simple, curved, three-way, Y-switch, double slip)

The application runs entirely in your browser with no backend required—all project data is stored locally in your browser's `localStorage`.

## Features

### ✅ Implemented

- **Multi-Project Management**
  - Create, rename, and delete multiple projects
  - Automatic persistence to `localStorage`
  - Project switching and reloading

- **Interactive Canvas**
  - Pan by dragging the background
  - Zoom with mouse wheel (0.35x to 4x)
  - Grid background for visual reference

- **Component Placement**
  - Drag-and-drop components from the sidebar onto the canvas
  - Click components to place them at the origin
  - Visual feedback with component labels

- **Track Geometry System**
  - Full geometric calculations for all component types
  - Accurate connector endpoint positioning
  - Support for complex switch geometries (curved switches, three-way, Y-switch, double slip)

- **Endpoint Snapping & Connection**
  - Automatic endpoint snapping when dragging items (8mm tolerance, 15° angle tolerance)
  - Auto-connect endpoints when snapping during drag operations
  - Manual endpoint selection (click to select, Shift-click for additive selection)
  - Connect/disconnect endpoints via toolbar buttons
  - Visual indicators for connected endpoints (green) and selected endpoints (red)

- **Item Manipulation**
  - Rotate selected items (15° steps) via toolbar buttons or keyboard shortcuts (`R` / `Shift+R`)
  - Delete selected items (`Delete` / `Backspace`)
  - Drag items to reposition (connected items move as a group)
  - Ground items to prevent movement/rotation (useful for fixed reference points)

- **Connection System**
  - Connected items move together as a group
  - Connected items cannot be rotated individually
  - Grounded items cannot be moved or rotated
  - Connection graph tracking for group movement

- **SVG Export**
  - Export complete layouts as SVG files
  - Automatic bounds calculation with padding
  - Component labels included in export

- **Keyboard Shortcuts**
  - `R` / `Shift+R` - Rotate selected item left/right
  - `Delete` / `Backspace` - Delete selected item
  - `Escape` - Clear selection

- **Debug Mode**
  - Toggle debug visualization to see endpoint vectors and connector labels
  - Helpful for understanding geometry and connection points

### 🚧 Not Yet Implemented

- **Import Functionality** - Import layouts from files (currently stubbed)
- **Multiple Track Systems per Layout** - Currently supports one active track system per layout
- **Elevation/Layer/Wiring Overlays** - Future annotation system for multi-level layouts
- **Undo/Redo** - History management for operations
- **Grid Snapping** - Currently only endpoint snapping is available
- **Additional Track Systems** - Currently only PIKO A-Gleis H0 is included (extensible via `TrackSystemDefinition`)

## Technology Stack

- **React 19.2.0** - UI framework with latest features
- **TypeScript 5.9.3** - Type safety and developer experience
- **Vite 7.2.2** - Build tool and dev server with HMR
- **Tailwind CSS 4.0.0-alpha.14** - Utility-first CSS via `@tailwindcss/vite` plugin
- **ESLint + Prettier** - Code quality and formatting

## Getting Started

### Prerequisites

- Node.js (v18 or later recommended)
- npm or compatible package manager

### Installation

```bash
npm install
```

### Development

Start the development server with hot module replacement:

```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the port Vite assigns).

### Build

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

### Linting

Run ESLint to check code quality:

```bash
npm run lint
```

## Project Structure

```
src/
├── components/Layout/     # UI components (Canvas, Sidebars, Toolbar)
├── state/                 # State management (projects, layout)
├── types/                 # TypeScript definitions
├── geometry/              # Track geometry calculations
├── export/                # SVG export functionality
├── data/                  # Track system definitions (PIKO A-Gleis H0)
├── hooks/                 # Custom React hooks
└── constants/             # Application constants
```

## Usage Tips

1. **Placing Components**: Drag components from the right sidebar onto the canvas, or click to place at the origin
2. **Connecting Tracks**: Drag an item near another item's endpoint to snap and auto-connect, or manually select two endpoints and click "Connect endpoints"
3. **Moving Connected Groups**: When items are connected, dragging one moves the entire connected group
4. **Grounding Items**: Use the "Ground" button to lock items in place—useful for establishing fixed reference points
5. **Rotation Pivot**: When an endpoint is selected, rotation pivots around that endpoint
6. **Debug Mode**: Enable debug mode to visualize endpoint vectors and connector information

## Development Status

This application is actively being developed. The core track planning functionality is working, but the project is still evolving. Future enhancements may include:

- Additional track system catalogs
- Import/export in various formats
- Multi-level layout support
- Undo/redo functionality
- Enhanced snapping options
- Measurement tools
- Print layout support

## License

[Add your license information here]
