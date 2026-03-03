import * as THREE from 'three';
import type { TrackComponentDefinition } from '../types/trackSystem';
import { getComponentGeometry } from './trackGeometry';

/** H0 gauge: 16.5mm, half = 8.25mm for rail offset */
const HALF_GAUGE_MM = 8.25;
/** Rail tube radius in mm */
export const RAIL_RADIUS_MM = 1.5;
/** Tie spacing in mm */
export const TIE_SPACING_MM = 10;

export interface TrackCurve3D {
  centerline: THREE.Curve<THREE.Vector3>;
  leftRail: THREE.Curve<THREE.Vector3>;
  rightRail: THREE.Curve<THREE.Vector3>;
  lengthMm: number;
}

interface PathSegment {
  type: 'line' | 'arc';
  // Line: start and end points
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  // Arc additional data
  rx?: number;
  ry?: number;
  sweepFlag?: number;
}

/** Parse SVG path d string into segments (M/L/A commands only) */
function parseSvgPath(d: string): PathSegment[] {
  const segments: PathSegment[] = [];
  // Split the path string into individual subpaths (separated by M commands)
  const subpaths = d.split(/(?=M\s)/);

  for (const subpath of subpaths) {
    const trimmed = subpath.trim();
    if (!trimmed) continue;

    // Extract M start point
    const mMatch = trimmed.match(/M\s+([-\d.e+]+)\s+([-\d.e+]+)/);
    if (!mMatch) continue;

    let cx = parseFloat(mMatch[1]);
    let cy = parseFloat(mMatch[2]);

    // Find all L and A commands after the M
    const afterM = trimmed.substring(mMatch[0].length).trim();
    if (!afterM) continue;

    // Match L commands
    const lRegex = /L\s+([-\d.e+]+)\s+([-\d.e+]+)/g;
    const aRegex =
      /A\s+([-\d.e+]+)\s+([-\d.e+]+)\s+([-\d.e+]+)\s+(\d)\s+(\d)\s+([-\d.e+]+)\s+([-\d.e+]+)/g;

    // Process the remaining commands in order
    const remaining = afterM;

    // We need to process L and A in order of appearance
    const commands: { index: number; type: 'L' | 'A'; match: RegExpExecArray }[] = [];

    let match: RegExpExecArray | null;
    lRegex.lastIndex = 0;
    aRegex.lastIndex = 0;

    while ((match = lRegex.exec(remaining)) !== null) {
      commands.push({ index: match.index, type: 'L', match: { ...match } as RegExpExecArray });
    }
    while ((match = aRegex.exec(remaining)) !== null) {
      commands.push({ index: match.index, type: 'A', match: { ...match } as RegExpExecArray });
    }

    commands.sort((a, b) => a.index - b.index);

    for (const cmd of commands) {
      if (cmd.type === 'L') {
        const ex = parseFloat(cmd.match[1]);
        const ey = parseFloat(cmd.match[2]);
        segments.push({ type: 'line', sx: cx, sy: cy, ex, ey });
        cx = ex;
        cy = ey;
      } else {
        const rx = parseFloat(cmd.match[1]);
        const ry = parseFloat(cmd.match[2]);
        const sweepFlag = parseInt(cmd.match[5]);
        const ex = parseFloat(cmd.match[6]);
        const ey = parseFloat(cmd.match[7]);
        segments.push({ type: 'arc', sx: cx, sy: cy, ex, ey, rx, ry, sweepFlag });
        cx = ex;
        cy = ey;
      }
    }
  }

  return segments;
}

/** Sample points along a circular arc from (sx,sy) to (ex,ey) with given radius and sweep */
function sampleArcPoints(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  radius: number,
  sweepFlag: number,
  numSamples: number
): THREE.Vector3[] {
  // Find center of arc using SVG arc math
  const dx = (sx - ex) / 2;
  const dy = (sy - ey) / 2;
  const midX = (sx + ex) / 2;
  const midY = (sy + ey) / 2;

  const r2 = radius * radius;
  const d2 = dx * dx + dy * dy;

  // Clamp to avoid NaN from floating-point precision
  const sq = Math.sqrt(Math.max(0, r2 / d2 - 1));

  // large-arc-flag is always 0 in our paths
  const sign = sweepFlag === 1 ? 1 : -1;
  const centerX = midX + sign * sq * dy;
  const centerY = midY - sign * sq * dx;

  const startAngle = Math.atan2(sy - centerY, sx - centerX);
  let endAngle = Math.atan2(ey - centerY, ex - centerX);

  // Determine sweep direction
  let deltaAngle = endAngle - startAngle;
  if (sweepFlag === 1) {
    if (deltaAngle < 0) deltaAngle += 2 * Math.PI;
  } else {
    if (deltaAngle > 0) deltaAngle -= 2 * Math.PI;
  }

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const angle = startAngle + t * deltaAngle;
    const x = centerX + radius * Math.cos(angle);
    // SVG Y → Three.js Z, Y stays at 0
    const z = centerY + radius * Math.sin(angle);
    points.push(new THREE.Vector3(x, 0, z));
  }

  return points;
}

/** Offset a set of 3D points along the normal direction by a given distance */
function offsetCurvePoints(points: THREE.Vector3[], offset: number): THREE.Vector3[] {
  const result: THREE.Vector3[] = [];

  for (let i = 0; i < points.length; i++) {
    // Compute tangent
    let tangent: THREE.Vector3;
    if (i === 0) {
      tangent = new THREE.Vector3().subVectors(points[1], points[0]).normalize();
    } else if (i === points.length - 1) {
      tangent = new THREE.Vector3().subVectors(points[i], points[i - 1]).normalize();
    } else {
      tangent = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]).normalize();
    }

    // Normal is perpendicular to tangent in XZ plane (Y is up)
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    result.push(
      new THREE.Vector3(
        points[i].x + normal.x * offset,
        points[i].y,
        points[i].z + normal.z * offset
      )
    );
  }

  return result;
}

function segmentToCurve3D(segment: PathSegment): TrackCurve3D {
  if (segment.type === 'line') {
    const start = new THREE.Vector3(segment.sx, 0, segment.sy);
    const end = new THREE.Vector3(segment.ex, 0, segment.ey);
    const centerline = new THREE.LineCurve3(start, end);
    const lengthMm = start.distanceTo(end);

    // For lines, compute normal from tangent direction
    const dx = segment.ex - segment.sx;
    const dy = segment.ey - segment.sy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const nz = dx / len;

    const leftRail = new THREE.LineCurve3(
      new THREE.Vector3(segment.sx + nx * HALF_GAUGE_MM, 0, segment.sy + nz * HALF_GAUGE_MM),
      new THREE.Vector3(segment.ex + nx * HALF_GAUGE_MM, 0, segment.ey + nz * HALF_GAUGE_MM)
    );
    const rightRail = new THREE.LineCurve3(
      new THREE.Vector3(segment.sx - nx * HALF_GAUGE_MM, 0, segment.sy - nz * HALF_GAUGE_MM),
      new THREE.Vector3(segment.ex - nx * HALF_GAUGE_MM, 0, segment.ey - nz * HALF_GAUGE_MM)
    );

    return { centerline, leftRail, rightRail, lengthMm };
  }

  // Arc segment
  const radius = segment.rx!;
  const sweepFlag = segment.sweepFlag!;
  const numSamples = Math.max(16, Math.ceil(radius * 0.1));

  const centerPoints = sampleArcPoints(
    segment.sx,
    segment.sy,
    segment.ex,
    segment.ey,
    radius,
    sweepFlag,
    numSamples
  );

  const leftPoints = offsetCurvePoints(centerPoints, HALF_GAUGE_MM);
  const rightPoints = offsetCurvePoints(centerPoints, -HALF_GAUGE_MM);

  const centerline = new THREE.CatmullRomCurve3(centerPoints, false, 'centripetal');
  const leftRail = new THREE.CatmullRomCurve3(leftPoints, false, 'centripetal');
  const rightRail = new THREE.CatmullRomCurve3(rightPoints, false, 'centripetal');

  // Approximate length
  let lengthMm = 0;
  for (let i = 1; i < centerPoints.length; i++) {
    lengthMm += centerPoints[i].distanceTo(centerPoints[i - 1]);
  }

  return { centerline, leftRail, rightRail, lengthMm };
}

/** Convert a track component definition into 3D curve data for rendering */
export function getTrackCurves3D(def: TrackComponentDefinition): TrackCurve3D[] {
  const geometry = getComponentGeometry(def);
  const pathD = geometry.buildPathD();
  const segments = parseSvgPath(pathD);

  return segments.map((seg) => segmentToCurve3D(seg));
}

/** Apply elevation (Y offsets) to track curves. Returns new curves with modified Y values. */
export function applyElevationToCurves(
  curves: TrackCurve3D[],
  startMm: number,
  endMm: number
): TrackCurve3D[] {
  const totalLength = curves.reduce((sum, c) => sum + c.lengthMm, 0);
  if (totalLength === 0) return curves;

  let accLen = 0;
  return curves.map((curve) => {
    const curveStartFrac = accLen / totalLength;
    accLen += curve.lengthMm;
    const curveEndFrac = accLen / totalLength;

    const yStart = startMm + curveStartFrac * (endMm - startMm);
    const yEnd = startMm + curveEndFrac * (endMm - startMm);

    if (curve.centerline instanceof THREE.LineCurve3) {
      const applyToLine = (line: THREE.LineCurve3) => {
        const s = line.v1.clone();
        const e = line.v2.clone();
        s.y = yStart;
        e.y = yEnd;
        return new THREE.LineCurve3(s, e);
      };
      return {
        centerline: applyToLine(curve.centerline),
        leftRail: applyToLine(curve.leftRail as THREE.LineCurve3),
        rightRail: applyToLine(curve.rightRail as THREE.LineCurve3),
        lengthMm: curve.lengthMm,
      };
    }

    // CatmullRomCurve3
    const applyToCatmull = (catmull: THREE.CatmullRomCurve3) => {
      const pts = catmull.points.map((p, i) => {
        const t = catmull.points.length > 1 ? i / (catmull.points.length - 1) : 0;
        const y = yStart + t * (yEnd - yStart);
        return new THREE.Vector3(p.x, y, p.z);
      });
      return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    };

    return {
      centerline: applyToCatmull(curve.centerline as THREE.CatmullRomCurve3),
      leftRail: applyToCatmull(curve.leftRail as THREE.CatmullRomCurve3),
      rightRail: applyToCatmull(curve.rightRail as THREE.CatmullRomCurve3),
      lengthMm: curve.lengthMm,
    };
  });
}

/** Get all connector positions in local 3D space (for endpoint indicators) */
export function getConnectorPositions3D(
  def: TrackComponentDefinition
): { key: string; position: THREE.Vector3 }[] {
  const geometry = getComponentGeometry(def);
  const result: { key: string; position: THREE.Vector3 }[] = [
    { key: 'start', position: new THREE.Vector3(geometry.start.xMm, 0, geometry.start.yMm) },
    { key: 'end', position: new THREE.Vector3(geometry.end.xMm, 0, geometry.end.yMm) },
  ];

  if (geometry.extraConnectors) {
    for (const [key, connector] of Object.entries(geometry.extraConnectors)) {
      result.push({
        key,
        position: new THREE.Vector3(connector.xMm, 0, connector.yMm),
      });
    }
  }

  return result;
}
