import { useMemo } from 'react';
import * as THREE from 'three';
import type { LayoutState } from '../../../types/layout';

interface BaseboardProps {
  layout: LayoutState | null;
}

const boardMaterial = new THREE.MeshStandardMaterial({
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

export function Baseboard({ layout }: BaseboardProps) {
  const { cx, cz, width, depth } = useMemo(() => {
    if (!layout || layout.placedItems.length === 0) {
      return { cx: 0, cz: 0, width: 2000, depth: 2000 };
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

    const padding = 300;
    const w = Math.max(maxX - minX + padding * 2, 1000);
    const d = Math.max(maxZ - minZ + padding * 2, 1000);
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      width: w,
      depth: d,
    };
  }, [layout]);

  const edgeThickness = 8;
  const edgeHeight = 15;

  return (
    <group>
      {/* Main board surface */}
      <mesh position={[cx, -2, cz]} rotation={[-Math.PI / 2, 0, 0]} material={boardMaterial}>
        <planeGeometry args={[width, depth]} />
      </mesh>

      {/* Edge frame */}
      {/* Front edge */}
      <mesh position={[cx, edgeHeight / 2 - 2, cz + depth / 2]} material={edgeMaterial}>
        <boxGeometry args={[width + edgeThickness * 2, edgeHeight, edgeThickness]} />
      </mesh>
      {/* Back edge */}
      <mesh position={[cx, edgeHeight / 2 - 2, cz - depth / 2]} material={edgeMaterial}>
        <boxGeometry args={[width + edgeThickness * 2, edgeHeight, edgeThickness]} />
      </mesh>
      {/* Left edge */}
      <mesh position={[cx - width / 2, edgeHeight / 2 - 2, cz]} material={edgeMaterial}>
        <boxGeometry args={[edgeThickness, edgeHeight, depth]} />
      </mesh>
      {/* Right edge */}
      <mesh position={[cx + width / 2, edgeHeight / 2 - 2, cz]} material={edgeMaterial}>
        <boxGeometry args={[edgeThickness, edgeHeight, depth]} />
      </mesh>
    </group>
  );
}
