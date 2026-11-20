import { Suspense, useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { LayoutState, PlacedItem } from '../../types/layout';
import type { TrackSystemDefinition, TrackComponentDefinition } from '../../types/trackSystem';
import { TrackScene } from './canvas3d/TrackScene';
import { TrackLabels } from './canvas3d/TrackLabels';
import { Baseboard, BASEBOARD_SURFACE_Y } from './canvas3d/Baseboard';
import { ElevationPanel } from './canvas3d/ElevationPanel';
import { computeSceneBounds, type SceneBounds3D } from './canvas3d/sceneBounds';

export interface Canvas3DCameraState {
  position: [number, number, number];
  target: [number, number, number];
}

interface Canvas3DProps {
  layout: LayoutState | null;
  trackSystem: TrackSystemDefinition | null;
  projectId?: string | null;
  selectedItemIds?: Set<string>;
  onSelectionChange?: (ids: string[]) => void;
  onUpdateElevation?: (itemId: string, connectorElevationsMm: Record<string, number>) => void;
  cameraState?: Canvas3DCameraState | null;
  onCameraStateChange?: (state: Canvas3DCameraState) => void;
}

interface PerfStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
}

function SceneSetup() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <hemisphereLight intensity={0.22} color="#e5e7eb" groundColor="#0f172a" />
      <directionalLight position={[700, 1200, 500]} intensity={0.9} castShadow={false} />
    </>
  );
}

function createFitCameraState(bounds: SceneBounds3D): Canvas3DCameraState {
  const orbitRadius = Math.max(bounds.sizeXZ * 0.95, 850);
  const targetY = Math.max(bounds.cy * 0.35, 0);
  const cameraY = Math.max(bounds.maxY + orbitRadius * 0.55, 450);
  return {
    target: [bounds.cx, targetY, bounds.cz],
    position: [bounds.cx + orbitRadius * 0.7, cameraY, bounds.cz + orbitRadius * 0.7],
  };
}

function CameraClipping({ bounds }: { bounds: SceneBounds3D }) {
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera);

  useEffect(() => {
    const near = Math.min(Math.max(bounds.sizeXZ * 0.003, 0.6), 8);
    const heightSpan = Math.max(bounds.maxY - bounds.minY, 200);
    const far = Math.max(bounds.sizeXZ * 8 + heightSpan * 4, 6000);
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }, [bounds, camera]);

  return null;
}

function AdaptiveGrid({ bounds }: { bounds: SceneBounds3D }) {
  const camera = useThree((state) => state.camera);
  const [lod, setLod] = useState<'near' | 'mid' | 'far'>('mid');
  const lodRef = useRef(lod);

  useFrame(() => {
    const dx = camera.position.x - bounds.cx;
    const dz = camera.position.z - bounds.cz;
    const dy = camera.position.y - bounds.cy;
    const distance = Math.hypot(dx, dz, dy * 0.65);
    const nextLod = distance < 1700 ? 'near' : distance < 3800 ? 'mid' : 'far';
    if (lodRef.current !== nextLod) {
      lodRef.current = nextLod;
      setLod(nextLod);
    }
  });

  const settings =
    lod === 'near'
      ? {
          cellSize: 50,
          sectionSize: 250,
          fadeDistance: 2600,
        }
      : lod === 'mid'
        ? {
            cellSize: 100,
            sectionSize: 500,
            fadeDistance: 5200,
          }
        : {
            cellSize: 200,
            sectionSize: 1000,
            fadeDistance: 9000,
          };

  return (
    <Grid
      args={[10000, 10000]}
      cellSize={settings.cellSize}
      cellThickness={0.45}
      cellColor="#334155"
      sectionSize={settings.sectionSize}
      sectionThickness={0.95}
      sectionColor="#475569"
      fadeDistance={settings.fadeDistance}
      fadeStrength={1}
      position={[bounds.cx, BASEBOARD_SURFACE_Y - 0.2, bounds.cz]}
      infiniteGrid
    />
  );
}

function PerformanceSampler({ onUpdate }: { onUpdate: (stats: PerfStats) => void }) {
  const gl = useThree((state) => state.gl);
  const accumulatorRef = useRef({
    seconds: 0,
    frames: 0,
    frameMsSum: 0,
  });

  useFrame((_state, delta) => {
    const accumulator = accumulatorRef.current;
    accumulator.seconds += delta;
    accumulator.frames += 1;
    accumulator.frameMsSum += delta * 1000;

    if (accumulator.seconds < 0.5) {
      return;
    }

    const frameCount = Math.max(accumulator.frames, 1);
    onUpdate({
      fps: frameCount / accumulator.seconds,
      frameMs: accumulator.frameMsSum / frameCount,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });

    accumulator.seconds = 0;
    accumulator.frames = 0;
    accumulator.frameMsSum = 0;
  });

  return null;
}

interface CameraControllerProps {
  bounds: SceneBounds3D;
  projectId?: string | null;
  cameraState?: Canvas3DCameraState | null;
  fitVersion: number;
  onCameraStateChange?: (state: Canvas3DCameraState) => void;
  onInteractionChange?: (isInteracting: boolean) => void;
}

function CameraController({
  bounds,
  projectId,
  cameraState,
  fitVersion,
  onCameraStateChange,
  onInteractionChange,
}: CameraControllerProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const hasInitialized = useRef(false);
  const previousProjectId = useRef<string | null | undefined>(undefined);
  const lastFitVersion = useRef(fitVersion);

  const emitCameraState = useCallback(() => {
    if (!onCameraStateChange) {
      return;
    }
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    onCameraStateChange({
      position: [
        controls.object.position.x,
        controls.object.position.y,
        controls.object.position.z,
      ],
      target: [controls.target.x, controls.target.y, controls.target.z],
    });
  }, [onCameraStateChange]);

  const applyCameraState = useCallback(
    (nextState: Canvas3DCameraState) => {
      const controls = controlsRef.current;
      if (!controls) {
        return;
      }
      controls.target.set(...nextState.target);
      controls.object.position.set(...nextState.position);
      controls.update();
      emitCameraState();
    },
    [emitCameraState]
  );

  const fitCamera = useCallback(() => {
    applyCameraState(createFitCameraState(bounds));
  }, [applyCameraState, bounds]);

  useEffect(() => {
    if (!controlsRef.current) {
      return;
    }

    if (!hasInitialized.current) {
      hasInitialized.current = true;
      previousProjectId.current = projectId;
      if (cameraState) {
        applyCameraState(cameraState);
      } else {
        fitCamera();
      }
      return;
    }

    if (previousProjectId.current !== projectId) {
      previousProjectId.current = projectId;
      fitCamera();
    }
  }, [applyCameraState, cameraState, fitCamera, projectId]);

  useEffect(() => {
    if (fitVersion === lastFitVersion.current) {
      return;
    }
    lastFitVersion.current = fitVersion;
    fitCamera();
  }, [fitCamera, fitVersion]);

  const maxDistance = Math.max(bounds.sizeXZ * 7.5, 4000);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      minDistance={70}
      maxDistance={maxDistance}
      maxPolarAngle={Math.PI / 2 - 0.02}
      onStart={() => onInteractionChange?.(true)}
      onEnd={() => {
        onInteractionChange?.(false);
        emitCameraState();
      }}
    />
  );
}

export default function Canvas3D({
  layout,
  trackSystem,
  projectId,
  selectedItemIds,
  onSelectionChange,
  onUpdateElevation,
  cameraState,
  onCameraStateChange,
}: Canvas3DProps) {
  const [showLabels, setShowLabels] = useState(false);
  const [fitVersion, setFitVersion] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const [perfStats, setPerfStats] = useState<PerfStats | null>(null);

  const maxDpr = useMemo(() => {
    if (typeof window === 'undefined') {
      return 1;
    }
    return Math.min(window.devicePixelRatio || 1, 1.35);
  }, []);
  const currentDpr = isInteracting ? 0.85 : maxDpr;

  const handleCreated = useCallback((state: { gl: THREE.WebGLRenderer }) => {
    state.gl.setClearColor(new THREE.Color('#0f172a'));
  }, []);

  const handlePointerMissed = useCallback(
    (event: unknown) => {
      const pointerEvent = event as { button?: number; delta?: number };
      if (pointerEvent.button !== undefined && pointerEvent.button !== 0) {
        return;
      }
      if ((pointerEvent.delta ?? 0) > 5) {
        return;
      }
      onSelectionChange?.([]);
    },
    [onSelectionChange]
  );

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

  const sceneBounds = useMemo(
    () => computeSceneBounds(layout, componentMap),
    [layout, componentMap]
  );

  const selectedItem: PlacedItem | null = useMemo(() => {
    if (!layout || !selectedItemIds || selectedItemIds.size !== 1) return null;
    const id = selectedItemIds.values().next().value as string;
    return layout.placedItems.find((item) => item.id === id) ?? null;
  }, [layout, selectedItemIds]);

  const selectedDef = selectedItem ? (componentMap.get(selectedItem.componentId) ?? null) : null;

  const initialCameraState = useMemo(() => createFitCameraState(sceneBounds), [sceneBounds]);

  return (
    <div className="relative flex-1 h-full">
      <Canvas
        frameloop="demand"
        dpr={currentDpr}
        camera={{ fov: 50, near: 5, far: 30000, position: initialCameraState.position }}
        onCreated={handleCreated}
        onPointerMissed={handlePointerMissed}
      >
        <Suspense fallback={null}>
          <SceneSetup />
          <CameraClipping bounds={sceneBounds} />
          <CameraController
            bounds={sceneBounds}
            projectId={projectId}
            cameraState={cameraState}
            fitVersion={fitVersion}
            onCameraStateChange={onCameraStateChange}
            onInteractionChange={setIsInteracting}
          />
          <Baseboard bounds={sceneBounds} basePlane={layout?.basePlane} />
          <AdaptiveGrid bounds={sceneBounds} />
          {layout && trackSystem && (
            <>
              <TrackScene
                layout={layout}
                trackSystem={trackSystem}
                selectedItemIds={selectedItemIds}
                onItemClick={handleItemClick}
              />
              {showLabels && (
                <TrackLabels
                  items={layout.placedItems}
                  componentMap={componentMap}
                  selectedItemIds={selectedItemIds}
                />
              )}
            </>
          )}
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
          </GizmoHelper>
          {import.meta.env.DEV && <PerformanceSampler onUpdate={setPerfStats} />}
        </Suspense>
      </Canvas>

      <div className="absolute top-3 left-3 flex items-center gap-2">
        <button
          onClick={() => setShowLabels((value) => !value)}
          className={`rounded px-2 py-1 text-xs ${
            showLabels
              ? 'bg-sky-600 text-white'
              : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
          }`}
        >
          Labels
        </button>
        <button
          onClick={() => setFitVersion((value) => value + 1)}
          className="rounded bg-slate-800/80 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
        >
          Fit
        </button>
      </div>

      {import.meta.env.DEV && perfStats && (
        <div className="pointer-events-none absolute top-3 right-3 rounded bg-slate-950/85 px-2 py-1 text-[10px] text-slate-200">
          <div>FPS {perfStats.fps.toFixed(0)}</div>
          <div>Frame {perfStats.frameMs.toFixed(1)}ms</div>
          <div>Calls {perfStats.drawCalls}</div>
          <div>Tri {Math.round(perfStats.triangles / 1000)}k</div>
        </div>
      )}

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
