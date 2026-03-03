import { Suspense, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid, Environment } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { LayoutState, PlacedItem } from '../../types/layout';
import type { TrackSystemDefinition } from '../../types/trackSystem';
import { TrackScene } from './canvas3d/TrackScene';
import { TrackLabels } from './canvas3d/TrackLabels';
import { Baseboard } from './canvas3d/Baseboard';
import { ElevationPanel } from './canvas3d/ElevationPanel';
import type { TrackComponentDefinition } from '../../types/trackSystem';

interface Canvas3DProps {
  layout: LayoutState | null;
  trackSystem: TrackSystemDefinition | null;
  selectedItemIds?: Set<string>;
  onSelectionChange?: (ids: string[]) => void;
  onUpdateElevation?: (itemId: string, startMm: number, endMm: number) => void;
}

function SceneSetup() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[500, 1000, 500]} intensity={0.8} castShadow={false} />
    </>
  );
}

function InvalidateOnChange({ deps }: { deps: unknown[] }) {
  const { invalidate: inv } = useThree();
  useEffect(() => {
    inv();
  }, [deps, inv]);
  return null;
}

function CameraController({ layout }: { layout: LayoutState | null }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const hasInitialized = useRef(false);

  const bounds = useMemo(() => {
    if (!layout || layout.placedItems.length === 0) {
      return { cx: 0, cz: 0, size: 1000 };
    }
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const item of layout.placedItems) {
      minX = Math.min(minX, item.x);
      maxX = Math.max(maxX, item.x);
      minZ = Math.min(minZ, item.y);
      maxZ = Math.max(maxZ, item.y);
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const size = Math.max(maxX - minX, maxZ - minZ, 500) + 200;
    return { cx, cz, size };
  }, [layout]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || hasInitialized.current) return;
    hasInitialized.current = true;

    controls.target.set(bounds.cx, 0, bounds.cz);
    controls.object.position.set(
      bounds.cx + bounds.size * 0.5,
      bounds.size * 0.8,
      bounds.cz + bounds.size * 0.5
    );
    controls.update();
  }, [bounds]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minDistance={50}
      maxDistance={10000}
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  );
}

export default function Canvas3D({
  layout,
  trackSystem,
  selectedItemIds,
  onSelectionChange,
  onUpdateElevation,
}: Canvas3DProps) {
  const [showLabels, setShowLabels] = useState(false);

  const handleCreated = useCallback((state: { gl: THREE.WebGLRenderer }) => {
    state.gl.setClearColor(new THREE.Color('#0f172a'));
  }, []);

  const handlePointerMissed = useCallback(() => {
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  const handleItemClick = useCallback(
    (itemId: string) => {
      onSelectionChange?.([itemId]);
    },
    [onSelectionChange]
  );

  const componentMap = useMemo(() => {
    if (!trackSystem) return new Map<string, TrackComponentDefinition>();
    const map = new Map<string, TrackComponentDefinition>();
    for (const comp of trackSystem.components) {
      map.set(comp.id, comp);
    }
    return map;
  }, [trackSystem]);

  // Selected item for elevation panel (single selection only)
  const selectedItem: PlacedItem | null = useMemo(() => {
    if (!layout || !selectedItemIds || selectedItemIds.size !== 1) return null;
    const id = selectedItemIds.values().next().value as string;
    return layout.placedItems.find((item) => item.id === id) ?? null;
  }, [layout, selectedItemIds]);

  const selectedDef = selectedItem ? (componentMap.get(selectedItem.componentId) ?? null) : null;

  return (
    <div className="relative flex-1 h-full">
      <Canvas
        shadows
        frameloop="demand"
        camera={{ fov: 50, near: 1, far: 50000, position: [500, 800, 500] }}
        onCreated={handleCreated}
        onPointerMissed={handlePointerMissed}
      >
        <Suspense fallback={null}>
          <SceneSetup />
          <Environment preset="warehouse" background={false} />
          <CameraController layout={layout} />
          <Baseboard layout={layout} />
          <Grid
            args={[10000, 10000]}
            cellSize={100}
            cellThickness={0.5}
            cellColor="#334155"
            sectionSize={500}
            sectionThickness={1}
            sectionColor="#475569"
            fadeDistance={5000}
            fadeStrength={1}
            position={[0, -0.5, 0]}
            infiniteGrid
          />
          {layout && trackSystem && (
            <>
              <TrackScene
                layout={layout}
                trackSystem={trackSystem}
                selectedItemIds={selectedItemIds}
                onItemClick={handleItemClick}
              />
              {showLabels && <TrackLabels items={layout.placedItems} componentMap={componentMap} />}
            </>
          )}
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
          </GizmoHelper>
          <InvalidateOnChange deps={[selectedItemIds, layout, showLabels]} />
        </Suspense>
      </Canvas>

      {/* Label toggle button */}
      <button
        onClick={() => setShowLabels((v) => !v)}
        className={`absolute top-3 left-3 rounded px-2 py-1 text-xs ${
          showLabels ? 'bg-sky-600 text-white' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
        }`}
      >
        Labels
      </button>

      {/* Elevation panel */}
      {selectedItem && selectedDef && onUpdateElevation && (
        <ElevationPanel
          item={selectedItem}
          componentDef={selectedDef}
          onUpdateElevation={onUpdateElevation}
        />
      )}
    </div>
  );
}
