import type { PlacedItem } from '../types/layout'
import type { TrackConnector } from '../types/trackSystem'
import { normalizeAngle, rotatePointLocal } from './trackGeometry'

const ROUND_PRECISION = 1e-6

const roundValue = (value: number) =>
  Math.round(value / ROUND_PRECISION) * ROUND_PRECISION

export interface EndpointPose {
  position: { xMm: number; yMm: number }
  directionDeg: number
}

export function getEndpointPose(item: PlacedItem, connector: TrackConnector): EndpointPose {
  const rotated = rotatePointLocal(connector.xMm, connector.yMm, item.rotationDeg)
  return {
    position: { xMm: item.x + rotated.x, yMm: item.y + rotated.y },
    directionDeg: normalizeAngle(connector.directionDeg + item.rotationDeg),
  }
}

export function computeConnectionTransform(
  anchorItem: PlacedItem,
  anchorConnector: TrackConnector,
  movingConnector: TrackConnector,
): { position: { x: number; y: number }; rotationDeg: number } {
  const anchorPose = getEndpointPose(anchorItem, anchorConnector)
  const desiredDirection = normalizeAngle(anchorPose.directionDeg + 180)
  const newRotation = normalizeAngle(desiredDirection - movingConnector.directionDeg)
  const rotatedLocal = rotatePointLocal(movingConnector.xMm, movingConnector.yMm, newRotation)
  return {
    position: {
      x: roundValue(anchorPose.position.xMm - rotatedLocal.x),
      y: roundValue(anchorPose.position.yMm - rotatedLocal.y),
    },
    rotationDeg: roundValue(newRotation),
  }
}
