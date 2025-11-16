import type {
  ComponentGeometry,
  TrackComponentDefinition,
  TrackConnector,
  WorldTransform,
} from '../types/trackSystem'

const toRad = (deg: number) => (deg * Math.PI) / 180

const warnMissing = (id: string) => {
  if (import.meta.env?.DEV) {
    console.warn(`Missing geometry definition for component "${id}"`)
  }
}

type SwitchDirection = 'left' | 'right'

interface SimpleSwitchMeta {
  variant: 'simple-switch'
  direction: SwitchDirection
  straightLengthMm: number
  branchRadiusMm: number
  branchAngleDeg: number
}

interface CurvedSwitchMeta {
  variant: 'curved-switch'
  direction: SwitchDirection
  innerRadiusMm: number
  outerRadiusMm: number
  angleDeg: number
}

interface ThreeWaySwitchMeta {
  variant: 'three-way'
  straightLengthMm: number
  branchRadiusMm: number
  branchAngleDeg: number
  branchOffsetMm: number
}

interface YSwitchMeta {
  variant: 'y-switch'
  stubLengthMm: number
  branchRadiusMm: number
  branchAngleDeg: number
}

interface DoubleSlipMeta {
  variant: 'double-slip'
  lengthMm: number
  crossingAngleDeg: number
  slipRadiusMm: number
}

type SwitchMeta = SimpleSwitchMeta | CurvedSwitchMeta | ThreeWaySwitchMeta | YSwitchMeta | DoubleSlipMeta

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isSwitchDirection = (value: unknown): value is SwitchDirection =>
  value === 'left' || value === 'right'

const hasNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isCurvedSwitchMeta = (meta: unknown): meta is CurvedSwitchMeta => {
  if (!isRecord(meta)) return false
  return (
    meta.variant === 'curved-switch' &&
    isSwitchDirection(meta.direction) &&
    hasNumber(meta.innerRadiusMm) &&
    hasNumber(meta.outerRadiusMm) &&
    hasNumber(meta.angleDeg)
  )
}

const isThreeWaySwitchMeta = (meta: unknown): meta is ThreeWaySwitchMeta =>
  isRecord(meta) &&
  meta.variant === 'three-way' &&
  hasNumber(meta.straightLengthMm) &&
  hasNumber(meta.branchRadiusMm) &&
  hasNumber(meta.branchAngleDeg) &&
  hasNumber(meta.branchOffsetMm)

const isYSwitchMeta = (meta: unknown): meta is YSwitchMeta => {
  if (!isRecord(meta)) return false
  return (
    meta.variant === 'y-switch' &&
    hasNumber(meta.stubLengthMm) &&
    hasNumber(meta.branchRadiusMm) &&
    hasNumber(meta.branchAngleDeg)
  )
}

const isDoubleSlipMeta = (meta: unknown): meta is DoubleSlipMeta => {
  if (!isRecord(meta)) return false
  return (
    meta.variant === 'double-slip' &&
    hasNumber(meta.lengthMm) &&
    hasNumber(meta.crossingAngleDeg) &&
    hasNumber(meta.slipRadiusMm)
  )
}

const isSimpleSwitchMeta = (meta: unknown): meta is SimpleSwitchMeta => {
  if (!isRecord(meta)) return false
  return (
    meta.variant === 'simple-switch' &&
    isSwitchDirection(meta.direction) &&
    hasNumber(meta.straightLengthMm) &&
    hasNumber(meta.branchRadiusMm) &&
    hasNumber(meta.branchAngleDeg)
  )
}

export function getComponentGeometry(def: TrackComponentDefinition): ComponentGeometry {
  switch (def.type) {
    case 'straight':
      return getStraightGeometry(def)
    case 'curve':
      return getCurveGeometry(def)
    case 'switch': {
      const meta = def.meta as SwitchMeta | undefined
      if (isSimpleSwitchMeta(meta)) {
        return getSimpleSwitchGeometry(def, meta)
      }
      if (isCurvedSwitchMeta(meta)) {
        return getCurvedSwitchGeometry(meta)
      }
      if (isThreeWaySwitchMeta(meta)) {
        return getThreeWaySwitchGeometry(meta)
      }
      if (isYSwitchMeta(meta)) {
        return getYSwitchGeometry(meta)
      }
      if (isDoubleSlipMeta(meta)) {
        return getDoubleSlipGeometry(meta)
      }
      return getSimpleSwitchGeometry(def)
    }
    default:
      warnMissing(def.id)
      return getStraightGeometry({ ...def, lengthMm: def.lengthMm ?? 10 })
  }
}

function getStraightGeometry(def: TrackComponentDefinition): ComponentGeometry {
  const length = def.lengthMm ?? 0

  const start: TrackConnector = {
    xMm: 0,
    yMm: 0,
    directionDeg: 0,
  }

  const end: TrackConnector = {
    xMm: length,
    yMm: 0,
    directionDeg: 0,
  }

  const buildPathD = () => `M 0 0 L ${length} 0`

  return { start, end, buildPathD }
}

function getCurveGeometry(def: TrackComponentDefinition): ComponentGeometry {
  const radius = def.radiusMm ?? 0
  const angleDeg = def.angleDeg ?? 0
  const clockwise = !!def.clockwise
  const theta = toRad(angleDeg)
  const directionSign = clockwise ? -1 : 1

  const start: TrackConnector = {
    xMm: 0,
    yMm: 0,
    directionDeg: 0,
  }

  const endX = radius * Math.sin(theta)
  const endY = directionSign * (radius - radius * Math.cos(theta))
  const endDirection = directionSign * angleDeg

  const end: TrackConnector = {
    xMm: endX,
    yMm: endY,
    directionDeg: endDirection,
  }

  const sweepFlag = clockwise ? 1 : 0

  const buildPathD = () =>
    `M 0 0 A ${radius} ${radius} 0 0 ${sweepFlag} ${endX} ${endY}`

  return { start, end, buildPathD }
}

/**
 * Models the WL/WR geometry as documented by PIKO (radius 907.97 mm, 15° branch, 239 mm main leg).
 * This captures the heel-to-toe straight plus diverging arc so connectors can snap perfectly.
 */
function getSimpleSwitchGeometry(
  def: TrackComponentDefinition,
  meta?: SimpleSwitchMeta,
): ComponentGeometry {
  const straightLength = meta?.straightLengthMm ?? def.lengthMm ?? 239.07
  const radius = meta?.branchRadiusMm ?? def.radiusMm ?? 907.97
  const branchAngleDeg = meta?.branchAngleDeg ?? def.angleDeg ?? 15
  const thetaRad = toRad(branchAngleDeg)

  const direction: SwitchDirection =
    meta?.direction ?? (def.id.toUpperCase().includes('L') ? 'left' : 'right')
  const directionSign = direction === 'left' ? 1 : -1

  const start: TrackConnector = {
    xMm: 0,
    yMm: 0,
    directionDeg: 0,
  }

  const straightConnector: TrackConnector = {
    xMm: straightLength,
    yMm: 0,
    directionDeg: 0,
  }

  const branchEndX = radius * Math.sin(thetaRad)
  const branchEndY = directionSign * (radius - radius * Math.cos(thetaRad))
  const branchConnector: TrackConnector = {
    xMm: branchEndX,
    yMm: branchEndY,
    directionDeg: directionSign * branchAngleDeg,
  }

  const buildPathD = () => {
    const largeArcFlag = 0
    const sweepFlag = direction === 'left' ? 1 : 0
    return [
      `M 0 0 L ${straightLength} 0`,
      `M 0 0 A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${branchEndX} ${branchEndY}`,
    ].join(' ')
  }

  return {
    start,
    end: straightConnector,
    buildPathD,
    extraConnectors: {
      branch: branchConnector,
      diverging: branchConnector,
    },
  }
}

function getCurvedSwitchGeometry(meta: CurvedSwitchMeta): ComponentGeometry {
  const { innerRadiusMm, outerRadiusMm, angleDeg, direction } = meta
  const theta = toRad(angleDeg)
  const sweepFlag = direction === 'left' ? 0 : 1
  const directionSign = direction === 'left' ? 1 : -1

  const start: TrackConnector = { xMm: 0, yMm: 0, directionDeg: 0 }

  const buildEnd = (radius: number): TrackConnector => {
    const xMm = radius * Math.sin(theta)
    const yMm = directionSign * (radius - radius * Math.cos(theta))
    const directionDeg = directionSign * angleDeg
    return { xMm, yMm, directionDeg }
  }

  const outerEnd = buildEnd(outerRadiusMm)
  const innerEnd = buildEnd(innerRadiusMm)

  const buildPathD = () => {
    const largeArcFlag = 0
    return [
      `M 0 0 A ${outerRadiusMm} ${outerRadiusMm} 0 ${largeArcFlag} ${sweepFlag} ${outerEnd.xMm} ${outerEnd.yMm}`,
      `M 0 0 A ${innerRadiusMm} ${innerRadiusMm} 0 ${largeArcFlag} ${sweepFlag} ${innerEnd.xMm} ${innerEnd.yMm}`,
    ].join(' ')
  }

  return {
    start,
    end: outerEnd,
    buildPathD,
    extraConnectors: {
      inner: innerEnd,
    },
  }
}

function getThreeWaySwitchGeometry(meta: ThreeWaySwitchMeta): ComponentGeometry {
  const { straightLengthMm, branchRadiusMm, branchAngleDeg, branchOffsetMm } = meta
  const theta = toRad(branchAngleDeg)
  const start: TrackConnector = { xMm: 0, yMm: 0, directionDeg: 0 }
  const mainEnd: TrackConnector = { xMm: straightLengthMm, yMm: 0, directionDeg: 0 }

  const buildBranch = (sign: 1 | -1): TrackConnector => {
    const xMm = branchOffsetMm + branchRadiusMm * Math.sin(theta)
    const yMm = sign * (branchRadiusMm - branchRadiusMm * Math.cos(theta))
    const directionDeg = sign * branchAngleDeg
    return { xMm, yMm, directionDeg }
  }

  const leftBranch = buildBranch(1)
  const rightBranch = buildBranch(-1)

  const buildPathD = () => {
    const largeArcFlag = 0
    return [
      `M 0 0 L ${straightLengthMm} 0`,
      `M ${branchOffsetMm} 0 A ${branchRadiusMm} ${branchRadiusMm} 0 ${largeArcFlag} 0 ${leftBranch.xMm} ${leftBranch.yMm}`,
      `M ${branchOffsetMm} 0 A ${branchRadiusMm} ${branchRadiusMm} 0 ${largeArcFlag} 1 ${rightBranch.xMm} ${rightBranch.yMm}`,
    ].join(' ')
  }

  return {
    start,
    end: mainEnd,
    buildPathD,
    extraConnectors: {
      leftBranch,
      rightBranch,
    },
  }
}

function getYSwitchGeometry(meta: YSwitchMeta): ComponentGeometry {
  const { stubLengthMm, branchRadiusMm, branchAngleDeg } = meta
  const theta = toRad(branchAngleDeg)
  const start: TrackConnector = { xMm: 0, yMm: 0, directionDeg: 0 }
  const stubEnd: TrackConnector = { xMm: stubLengthMm, yMm: 0, directionDeg: 0 }

  const buildBranch = (sign: 1 | -1): TrackConnector => {
    const xMm = stubLengthMm + branchRadiusMm * Math.sin(theta)
    const yMm = sign * (branchRadiusMm - branchRadiusMm * Math.cos(theta))
    const directionDeg = sign * branchAngleDeg
    return { xMm, yMm, directionDeg }
  }

  const left = buildBranch(1)
  const right = buildBranch(-1)

  const buildPathD = () => {
    const largeArcFlag = 0
    return [
      `M 0 0 L ${stubLengthMm} 0`,
      `M ${stubLengthMm} 0 A ${branchRadiusMm} ${branchRadiusMm} 0 ${largeArcFlag} 0 ${left.xMm} ${left.yMm}`,
      `M ${stubLengthMm} 0 A ${branchRadiusMm} ${branchRadiusMm} 0 ${largeArcFlag} 1 ${right.xMm} ${right.yMm}`,
    ].join(' ')
  }

  return {
    start,
    end: stubEnd,
    buildPathD,
    extraConnectors: {
      left,
      right,
    },
  }
}

function getDoubleSlipGeometry(meta: DoubleSlipMeta): ComponentGeometry {
  const { lengthMm, crossingAngleDeg, slipRadiusMm } = meta
  const half = lengthMm / 2
  const centerX = half
  const start: TrackConnector = { xMm: 0, yMm: 0, directionDeg: 0 }
  const end: TrackConnector = { xMm: lengthMm, yMm: 0, directionDeg: 0 }

  const verticalHalf = half
  const top: TrackConnector = { xMm: centerX, yMm: verticalHalf, directionDeg: 90 }
  const bottom: TrackConnector = { xMm: centerX, yMm: -verticalHalf, directionDeg: -90 }

  const angleRad = toRad(crossingAngleDeg)
  const diagXOffset = half * Math.cos(angleRad)
  const diagYOffset = half * Math.sin(angleRad)

  const diagPositive = { xMm: centerX + diagXOffset, yMm: diagYOffset }
  const diagNegative = { xMm: centerX - diagXOffset, yMm: -diagYOffset }

  const buildSlipArc = (
    from: { xMm: number; yMm: number },
    to: { xMm: number; yMm: number },
    sweepFlag: 0 | 1,
  ) => `M ${from.xMm} ${from.yMm} A ${slipRadiusMm} ${slipRadiusMm} 0 0 ${sweepFlag} ${to.xMm} ${to.yMm}`

  const buildPathD = () => {
    const horizontal = `M 0 0 L ${lengthMm} 0`
    const diagonal = `M ${diagNegative.xMm} ${diagNegative.yMm} L ${diagPositive.xMm} ${diagPositive.yMm}`
    const mirroredDiagonal = `M ${diagNegative.xMm} ${-diagNegative.yMm} L ${diagPositive.xMm} ${-diagPositive.yMm}`
    const vertical = `M ${centerX} ${-verticalHalf} L ${centerX} ${verticalHalf}`

    const leftToTop = buildSlipArc({ xMm: 0, yMm: 0 }, top, 0)
    const leftToBottom = buildSlipArc({ xMm: 0, yMm: 0 }, bottom, 1)
    const rightToTop = buildSlipArc({ xMm: lengthMm, yMm: 0 }, top, 1)
    const rightToBottom = buildSlipArc({ xMm: lengthMm, yMm: 0 }, bottom, 0)

    return [
      horizontal,
      vertical,
      diagonal,
      mirroredDiagonal,
      leftToTop,
      leftToBottom,
      rightToTop,
      rightToBottom,
    ].join(' ')
  }

  return {
    start,
    end,
    buildPathD,
    extraConnectors: {
      endB1: top,
      endB2: bottom,
    },
  }
}

// TODO: Add frog/closure-rail samples for WL/WR once wiring/insulated joint modelling is in scope.

export function transformConnector(local: TrackConnector, transform: WorldTransform): TrackConnector {
  const rad = toRad(transform.rotationDeg)
  const xr = local.xMm * Math.cos(rad) - local.yMm * Math.sin(rad)
  const yr = local.xMm * Math.sin(rad) + local.yMm * Math.cos(rad)

  return {
    xMm: xr + transform.x,
    yMm: yr + transform.y,
    directionDeg: normalizeAngle(local.directionDeg + transform.rotationDeg),
  }
}

export function rotatePointLocal(x: number, y: number, rotationDeg: number) {
  const rad = toRad(rotationDeg)
  return {
    x: x * Math.cos(rad) - y * Math.sin(rad),
    y: x * Math.sin(rad) + y * Math.cos(rad),
  }
}

export function normalizeAngle(deg: number) {
  let result = deg % 360
  if (result > 180) {
    result -= 360
  } else if (result <= -180) {
    result += 360
  }
  return result
}
