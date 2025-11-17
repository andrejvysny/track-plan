export interface Vec2 {
  x: number
  y: number
}

export const TRACK_EDGE_WIDTH_MM = 28
export const HALF_TRACK_EDGE_WIDTH_MM = TRACK_EDGE_WIDTH_MM / 2

export const DEG_TO_RAD = Math.PI / 180
export const RAD_TO_DEG = 180 / Math.PI

export const normalizeVec = (v: Vec2): Vec2 => {
  const len = Math.hypot(v.x, v.y)
  if (!len) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

export const rotate = (v: Vec2, angleRad: number): Vec2 => {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

export const transformPoint = (local: Vec2, rotationRad: number, pos: Vec2): Vec2 => {
  const rotated = rotate(local, rotationRad)
  return { x: rotated.x + pos.x, y: rotated.y + pos.y }
}

export const transformDir = (local: Vec2, rotationRad: number): Vec2 => rotate(local, rotationRad)

export const normalFromTangent = (tangent: Vec2): Vec2 => {
  const n = { x: -tangent.y, y: tangent.x }
  return normalizeVec(n)
}

export const edgeCorners = (center: Vec2, tangent: Vec2) => {
  const t = normalizeVec(tangent)
  const n = normalFromTangent(t)
  return {
    left: { x: center.x - n.x * HALF_TRACK_EDGE_WIDTH_MM, y: center.y - n.y * HALF_TRACK_EDGE_WIDTH_MM },
    right: { x: center.x + n.x * HALF_TRACK_EDGE_WIDTH_MM, y: center.y + n.y * HALF_TRACK_EDGE_WIDTH_MM },
  }
}

export const angleOf = (v: Vec2) => Math.atan2(v.y, v.x)

export const toRad = (deg: number) => deg * DEG_TO_RAD
export const toDeg = (rad: number) => rad * RAD_TO_DEG
