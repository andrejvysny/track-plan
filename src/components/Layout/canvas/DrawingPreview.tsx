import { memo } from 'react';
import type { CanvasDimensionShape, DrawingTool } from '../../../types/layout';
import { normalizeAngle } from '../../../geometry/trackGeometry';
import { getDimensionGeometry, formatDimensionLabel } from '../../../utils/shapeGeometry';
import { estimateTextWidth as estimateTextWidthShared } from '../../../utils/shapeGeometry';
import {
  SHAPE_STROKE_WIDTH,
  DIMENSION_TICK_LENGTH_MM,
  DIMENSION_TEXT_PADDING_MM,
  DIMENSION_OFFSET_MM,
  DIMENSION_MIN_LENGTH_MM,
  TEXT_CHAR_WIDTH_FACTOR,
  TEXT_DEFAULT_WIDTH_MM,
  TEXT_DEFAULT_HEIGHT_MM,
} from '../../../constants/layout';

const SHAPE_STROKE_COLOR = 'white';

const estimateTextWidth = (text: string, fontSize: number) =>
  estimateTextWidthShared(text, fontSize, TEXT_CHAR_WIDTH_FACTOR);

const computeRectangleDimensions = (dx: number, dy: number, enforceSquare: boolean) => {
  if (enforceSquare) {
    const size = Math.max(dx, dy);
    return { width: size, height: size };
  }
  return { width: dx, height: dy };
};

const computeTextDimensions = (dx: number, dy: number, enforceSquare: boolean) => {
  const width = Math.max(dx, TEXT_DEFAULT_WIDTH_MM);
  const height = Math.max(dy, TEXT_DEFAULT_HEIGHT_MM);
  if (enforceSquare) {
    const size = Math.max(width, height);
    return { width: size, height: size };
  }
  return { width, height };
};

const BASE_PLANE_STROKE_COLOR = '#60a5fa';

const PreviewLabel = ({
  x,
  y,
  text,
  color,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
}) => {
  const fontSize = 8;
  const width = estimateTextWidth(text, fontSize) + DIMENSION_TEXT_PADDING_MM * 2;
  const height = fontSize + DIMENSION_TEXT_PADDING_MM * 2;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill="rgba(15, 23, 42, 0.85)"
        stroke={color}
        strokeWidth={1}
        rx={2}
      />
      <text
        x={0}
        y={fontSize / 3}
        textAnchor="middle"
        fontSize={fontSize}
        className="fill-slate-100"
      >
        {text}
      </text>
    </g>
  );
};

export type DrawingPreviewProps = {
  drawingTool: DrawingTool;
  drawStart: { x: number; y: number };
  drawCurrent: { x: number; y: number };
  drawShiftActive: boolean;
};

export const DrawingPreview = memo(function DrawingPreview({
  drawingTool,
  drawStart,
  drawCurrent,
  drawShiftActive,
}: DrawingPreviewProps) {
  const dx = drawCurrent.x - drawStart.x;
  const dy = drawCurrent.y - drawStart.y;
  const centerX = (drawStart.x + drawCurrent.x) / 2;
  const centerY = (drawStart.y + drawCurrent.y) / 2;

  if (drawingTool === 'dimension') {
    return (
      <DimensionPreview drawStart={drawStart} dx={dx} dy={dy} drawShiftActive={drawShiftActive} />
    );
  }

  if (drawingTool === 'line') {
    let lx = dx;
    let ly = dy;
    if (drawShiftActive) {
      if (Math.abs(lx) > Math.abs(ly)) ly = 0;
      else lx = 0;
    }
    const endX = drawStart.x + lx;
    const endY = drawStart.y + ly;
    const length = Math.hypot(lx, ly);
    return (
      <g pointerEvents="none">
        <line
          x1={drawStart.x}
          y1={drawStart.y}
          x2={endX}
          y2={endY}
          stroke={SHAPE_STROKE_COLOR}
          strokeWidth={SHAPE_STROKE_WIDTH}
          strokeDasharray="4 4"
          strokeLinecap="round"
          opacity={0.8}
        />
        {length > 0.5 && (
          <PreviewLabel
            x={(drawStart.x + endX) / 2}
            y={(drawStart.y + endY) / 2 - 10}
            text={`${length.toFixed(1)} mm`}
            color={SHAPE_STROKE_COLOR}
          />
        )}
      </g>
    );
  }

  if (drawingTool === 'circle') {
    const radius = Math.hypot(dx, dy) / 2;
    return (
      <circle
        cx={centerX}
        cy={centerY}
        r={radius}
        fill="none"
        stroke={SHAPE_STROKE_COLOR}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeDasharray="4 4"
        opacity={0.7}
      />
    );
  }

  const isBasePlane = drawingTool === 'basePlaneRect';
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const dimensions =
    drawingTool === 'text'
      ? computeTextDimensions(absDx, absDy, drawShiftActive)
      : computeRectangleDimensions(absDx, absDy, drawShiftActive);
  const halfWidth = dimensions.width / 2;
  const halfHeight = (dimensions.height ?? dimensions.width) / 2;
  const color = isBasePlane ? BASE_PLANE_STROKE_COLOR : SHAPE_STROKE_COLOR;
  const showDims = (drawingTool === 'rectangle' || isBasePlane) && (absDx > 0.5 || absDy > 0.5);
  return (
    <g pointerEvents="none">
      <rect
        x={centerX - halfWidth}
        y={centerY - halfHeight}
        width={dimensions.width}
        height={dimensions.height ?? dimensions.width}
        fill={isBasePlane ? 'rgba(96, 165, 250, 0.08)' : 'none'}
        stroke={color}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeDasharray="4 4"
        opacity={0.8}
      />
      {showDims && (
        <PreviewLabel
          x={centerX}
          y={centerY}
          text={`${dimensions.width.toFixed(0)} × ${(dimensions.height ?? dimensions.width).toFixed(0)} mm`}
          color={color}
        />
      )}
    </g>
  );
});

type DimensionPreviewProps = {
  drawStart: { x: number; y: number };
  dx: number;
  dy: number;
  drawShiftActive: boolean;
};

function DimensionPreview({ drawStart, dx, dy, drawShiftActive }: DimensionPreviewProps) {
  let dimensionDx = dx;
  let dimensionDy = dy;
  if (drawShiftActive) {
    if (Math.abs(dimensionDx) > Math.abs(dimensionDy)) {
      dimensionDy = 0;
    } else {
      dimensionDx = 0;
    }
  }
  const length = Math.hypot(dimensionDx, dimensionDy);
  if (length < DIMENSION_MIN_LENGTH_MM) return null;

  const tempShape: CanvasDimensionShape = {
    id: 'preview-dimension',
    type: 'dimension',
    x: drawStart.x + dimensionDx / 2,
    y: drawStart.y + dimensionDy / 2,
    length,
    rotationDeg: normalizeAngle((Math.atan2(dimensionDy, dimensionDx) * 180) / Math.PI),
    offsetMm: DIMENSION_OFFSET_MM,
  };
  const geometry = getDimensionGeometry(tempShape);
  const tickHalf = DIMENSION_TICK_LENGTH_MM / 2;
  const tickDir = geometry.normal;
  const label = formatDimensionLabel(tempShape);
  const fontSize = 8;
  const labelPos = {
    x: (geometry.offsetStart.x + geometry.offsetEnd.x) / 2,
    y: (geometry.offsetStart.y + geometry.offsetEnd.y) / 2,
  };
  const textRotation =
    tempShape.rotationDeg > 90 && tempShape.rotationDeg < 270
      ? tempShape.rotationDeg - 180
      : tempShape.rotationDeg;
  const labelBgWidth = estimateTextWidth(label, fontSize) + DIMENSION_TEXT_PADDING_MM * 2;
  const labelBgHeight = fontSize + DIMENSION_TEXT_PADDING_MM * 2;

  return (
    <g pointerEvents="none" opacity={0.8}>
      <line
        x1={geometry.start.x}
        y1={geometry.start.y}
        x2={geometry.offsetStart.x}
        y2={geometry.offsetStart.y}
        stroke={SHAPE_STROKE_COLOR}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      <line
        x1={geometry.end.x}
        y1={geometry.end.y}
        x2={geometry.offsetEnd.x}
        y2={geometry.offsetEnd.y}
        stroke={SHAPE_STROKE_COLOR}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      <line
        x1={geometry.offsetStart.x}
        y1={geometry.offsetStart.y}
        x2={geometry.offsetEnd.x}
        y2={geometry.offsetEnd.y}
        stroke={SHAPE_STROKE_COLOR}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray="4 2"
      />
      <line
        x1={geometry.offsetStart.x - tickDir.x * tickHalf}
        y1={geometry.offsetStart.y - tickDir.y * tickHalf}
        x2={geometry.offsetStart.x + tickDir.x * tickHalf}
        y2={geometry.offsetStart.y + tickDir.y * tickHalf}
        stroke={SHAPE_STROKE_COLOR}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray="4 2"
      />
      <line
        x1={geometry.offsetEnd.x - tickDir.x * tickHalf}
        y1={geometry.offsetEnd.y - tickDir.y * tickHalf}
        x2={geometry.offsetEnd.x + tickDir.x * tickHalf}
        y2={geometry.offsetEnd.y + tickDir.y * tickHalf}
        stroke={SHAPE_STROKE_COLOR}
        strokeWidth={SHAPE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray="4 2"
      />
      <g transform={`translate(${labelPos.x} ${labelPos.y}) rotate(${textRotation})`}>
        <rect
          x={-labelBgWidth / 2}
          y={-labelBgHeight / 2}
          width={labelBgWidth}
          height={labelBgHeight}
          fill="rgba(15, 23, 42, 0.65)"
          stroke={SHAPE_STROKE_COLOR}
          strokeWidth={1}
          rx={2}
        />
        <text
          x={0}
          y={fontSize / 3}
          textAnchor="middle"
          fontSize={fontSize}
          className="fill-slate-100"
        >
          {label}
        </text>
      </g>
    </g>
  );
}
