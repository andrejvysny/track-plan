import type { PlacedItem } from '../types/layout'
import type { TrackConnector, Vec2 } from '../types/trackSystem'
import {
  angleOf,
  normalizeVec,
  toDeg,
  toRad,
  transformDir,
  transformPoint,
} from './geometryUtils'
import { normalizeAngle } from './trackGeometry'

const ROUND_PRECISION = 1e-6

const roundValue = (value: number) =>
  Math.round(value / ROUND_PRECISION) * ROUND_PRECISION

export interface EndpointPose {
  position: { xMm: number; yMm: number }
  direction: Vec2
  directionDeg: number
}

export function getEndpointPose(item: PlacedItem, connector: TrackConnector): EndpointPose {
  const rotationRad = toRad(item.rotationDeg)
  const position = transformPoint(
    { x: connector.xMm, y: connector.yMm },
    rotationRad,
    { x: item.x, y: item.y },
  )
  const direction = normalizeVec(transformDir(connector.dir, rotationRad))
  return {
    position: { xMm: position.x, yMm: position.y },
    direction,
    directionDeg: normalizeAngle(toDeg(angleOf(direction))),
  }
}

/**
 * Connects two endpoints using their tangent directions and 28 mm edge centers.
 *
 * Flow:
 *   anchorPose → targetDir (-anchor) → rotation from moving.dir → translated so centers coincide.
 *
 * Mermaid (kept inline for maintainers):
 * flowchart TD
 *   A[Pose of anchor endpoint] --> B[targetDir = -anchor.dir]
 *   B --> C[rotation = angle(target) - angle(moving.dir)]
 *   C --> D[rotate moving.pos by rotation]
 *   D --> E[translation = anchor.pos - rotatedPos]
 *   E --> F[apply rotation + translation]
 */
export function computeConnectionTransform(
  anchorItem: PlacedItem,
  anchorConnector: TrackConnector,
  movingConnector: TrackConnector,
): { position: { x: number; y: number }; rotationDeg: number } {
  const anchorPose = getEndpointPose(anchorItem, anchorConnector)
  const targetDir = { x: -anchorPose.direction.x, y: -anchorPose.direction.y }

  const angleTarget = angleOf(targetDir)
  const movingDirLocal = normalizeVec(movingConnector.dir)
  const angleMovingLocal = angleOf(movingDirLocal)

  const rotationRad = angleTarget - angleMovingLocal
  const rotatedLocal = transformPoint(
    { x: movingConnector.xMm, y: movingConnector.yMm },
    rotationRad,
    { x: 0, y: 0 },
  )

  const position = {
    x: roundValue(anchorPose.position.xMm - rotatedLocal.x),
    y: roundValue(anchorPose.position.yMm - rotatedLocal.y),
  }

  const rotationDeg = roundValue(normalizeAngle(toDeg(rotationRad)))

  // Lightweight tolerance check to spot template mistakes without breaking UX.
  const movingWorldPos = transformPoint({ x: movingConnector.xMm, y: movingConnector.yMm }, rotationRad, position)
  const movingWorldDir = normalizeVec(transformDir(movingConnector.dir, rotationRad))
  const posError = Math.hypot(movingWorldPos.x - anchorPose.position.xMm, movingWorldPos.y - anchorPose.position.yMm)
  const dirDot = anchorPose.direction.x * movingWorldDir.x + anchorPose.direction.y * movingWorldDir.y
  const dirError = Math.abs(dirDot + 1)
  if (posError > 1e-3 || dirError > 1e-3) {
    console.warn('Endpoint connection tolerance exceeded', { posError, dirError, anchorPose, movingConnector })
  }

  return {
    position,
    rotationDeg,
  }
}
