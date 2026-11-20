import { useMemo } from 'react';
import * as THREE from 'three';
import type { BasePlane, BasePlaneBoard } from '../../../types/layout';
import { toRad } from '../../../geometry/geometryUtils';
import type { SceneBounds3D } from './sceneBounds';

interface BaseboardProps {
  bounds: SceneBounds3D;
  /** User-drawn benchwork; when present it replaces the auto-sized board. */
  basePlane?: BasePlane;
}

export const BASEBOARD_SURFACE_Y = -2;

const EDGE_THICKNESS = 8;
const EDGE_HEIGHT = 15;

const boardMaterial = new THREE.MeshStandardMaterial({
  color: 0x2d5a27,
  roughness: 0.95,
  metalness: 0,
  side: THREE.FrontSide,
});

const polygonMaterial = new THREE.MeshStandardMaterial({
  color: 0x2d5a27,
  roughness: 0.95,
  metalness: 0,
  side: THREE.DoubleSide,
});

const edgeMaterial = new THREE.MeshStandardMaterial({
  color: 0x8b6914,
  roughness: 0.8,
  metalness: 0.05,
});

/** A single user-drawn board. SVG (x, y) maps to world (x, z); Y is up. */
function BoardMesh({ board }: { board: BasePlaneBoard }) {
  const polygonGeometry = useMemo(() => {
    if (board.kind !== 'polygon') return null;
    const shape = new THREE.Shape();
    board.points.forEach((p, i) => {
      if (i === 0) shape.moveTo(p.x, p.y);
      else shape.lineTo(p.x, p.y);
    });
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [board]);

  if (board.kind === 'polygon' && polygonGeometry) {
    // rotation [+90°] about X maps local (x, y) -> world (x, z) without mirroring.
    return (
      <mesh
        position={[0, BASEBOARD_SURFACE_Y, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        geometry={polygonGeometry}
        material={polygonMaterial}
      />
    );
  }

  if (board.kind !== 'rect') return null;
  const { width, height } = board;
  return (
    <group
      position={[board.x, BASEBOARD_SURFACE_Y, board.y]}
      rotation={[0, -toRad(board.rotationDeg), 0]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={boardMaterial}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <mesh position={[0, EDGE_HEIGHT / 2, height / 2]} material={edgeMaterial}>
        <boxGeometry args={[width + EDGE_THICKNESS * 2, EDGE_HEIGHT, EDGE_THICKNESS]} />
      </mesh>
      <mesh position={[0, EDGE_HEIGHT / 2, -height / 2]} material={edgeMaterial}>
        <boxGeometry args={[width + EDGE_THICKNESS * 2, EDGE_HEIGHT, EDGE_THICKNESS]} />
      </mesh>
      <mesh position={[-width / 2, EDGE_HEIGHT / 2, 0]} material={edgeMaterial}>
        <boxGeometry args={[EDGE_THICKNESS, EDGE_HEIGHT, height]} />
      </mesh>
      <mesh position={[width / 2, EDGE_HEIGHT / 2, 0]} material={edgeMaterial}>
        <boxGeometry args={[EDGE_THICKNESS, EDGE_HEIGHT, height]} />
      </mesh>
    </group>
  );
}

export function Baseboard({ bounds, basePlane }: BaseboardProps) {
  if (basePlane && basePlane.boards.length > 0) {
    return (
      <group>
        {basePlane.boards.map((board) => (
          <BoardMesh key={board.id} board={board} />
        ))}
      </group>
    );
  }

  // Fallback: auto-sized board derived from the track bounds.
  const cx = bounds.cx;
  const cz = bounds.cz;
  const width = Math.max(bounds.maxX - bounds.minX, 1200);
  const depth = Math.max(bounds.maxZ - bounds.minZ, 1200);

  return (
    <group>
      <mesh
        position={[cx, BASEBOARD_SURFACE_Y, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={boardMaterial}
      >
        <planeGeometry args={[width, depth]} />
      </mesh>

      <mesh
        position={[cx, EDGE_HEIGHT / 2 + BASEBOARD_SURFACE_Y, cz + depth / 2]}
        material={edgeMaterial}
      >
        <boxGeometry args={[width + EDGE_THICKNESS * 2, EDGE_HEIGHT, EDGE_THICKNESS]} />
      </mesh>
      <mesh
        position={[cx, EDGE_HEIGHT / 2 + BASEBOARD_SURFACE_Y, cz - depth / 2]}
        material={edgeMaterial}
      >
        <boxGeometry args={[width + EDGE_THICKNESS * 2, EDGE_HEIGHT, EDGE_THICKNESS]} />
      </mesh>
      <mesh
        position={[cx - width / 2, EDGE_HEIGHT / 2 + BASEBOARD_SURFACE_Y, cz]}
        material={edgeMaterial}
      >
        <boxGeometry args={[EDGE_THICKNESS, EDGE_HEIGHT, depth]} />
      </mesh>
      <mesh
        position={[cx + width / 2, EDGE_HEIGHT / 2 + BASEBOARD_SURFACE_Y, cz]}
        material={edgeMaterial}
      >
        <boxGeometry args={[EDGE_THICKNESS, EDGE_HEIGHT, depth]} />
      </mesh>
    </group>
  );
}
