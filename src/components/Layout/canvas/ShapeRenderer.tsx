import { memo, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import type { CanvasDimensionShape, CanvasShape, CanvasTextShape } from '../../../types/layout';
import { getDimensionGeometry, formatDimensionLabel } from '../../../utils/shapeGeometry';
import {
  SHAPE_STROKE_WIDTH,
  DIMENSION_TICK_LENGTH_MM,
  DIMENSION_TEXT_PADDING_MM,
  TEXT_CHAR_WIDTH_FACTOR,
} from '../../../constants/layout';
import { estimateTextWidth as estimateTextWidthShared } from '../../../utils/shapeGeometry';

const SHAPE_STROKE_COLOR = 'white';
const SELECTED_SHAPE_STROKE_COLOR = '#60a5fa';

const estimateTextWidth = (text: string, fontSize: number) =>
  estimateTextWidthShared(text, fontSize, TEXT_CHAR_WIDTH_FACTOR);

type DragPreview = { x: number; y: number; rotationDeg: number };

export type ShapeRendererProps = {
  shape: CanvasShape;
  isSelected: boolean;
  isDragging: boolean;
  dragPreview: DragPreview | null;
  editingTextId: string | null;
  editingTextValue: string;
  textInputRef: RefObject<HTMLDivElement | null>;
  onTextInput: (value: string) => void;
  onTextKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onTextBlur: () => void;
  onTextDoubleClick: (shape: CanvasTextShape) => void;
};

export const ShapeRenderer = memo(function ShapeRenderer({
  shape,
  isSelected,
  isDragging,
  dragPreview,
  editingTextId,
  editingTextValue,
  textInputRef,
  onTextInput,
  onTextKeyDown,
  onTextBlur,
  onTextDoubleClick,
}: ShapeRendererProps) {
  const x = isDragging && dragPreview ? dragPreview.x : shape.x;
  const y = isDragging && dragPreview ? dragPreview.y : shape.y;
  const rotationDeg = isDragging && dragPreview ? dragPreview.rotationDeg : shape.rotationDeg;
  const strokeColor = isSelected ? SELECTED_SHAPE_STROKE_COLOR : SHAPE_STROKE_COLOR;
  const strokeWidth = isSelected ? SHAPE_STROKE_WIDTH + 1 : SHAPE_STROKE_WIDTH;

  if (shape.type === 'circle') {
    const radius = shape.width / 2;
    return (
      <circle
        data-shape={shape.id}
        cx={x}
        cy={y}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        transform={`rotate(${rotationDeg} ${x} ${y})`}
        style={{ cursor: 'pointer' }}
      />
    );
  }

  if (shape.type === 'rectangle') {
    const width = shape.width;
    const height = shape.height ?? shape.width;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return (
      <rect
        data-shape={shape.id}
        x={x - halfWidth}
        y={y - halfHeight}
        width={width}
        height={height}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        transform={`rotate(${rotationDeg} ${x} ${y})`}
        style={{ cursor: 'pointer' }}
      />
    );
  }

  if (shape.type === 'dimension') {
    return (
      <DimensionShapeSvg
        shape={shape as CanvasDimensionShape}
        x={x}
        y={y}
        rotationDeg={rotationDeg}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
      />
    );
  }

  if (shape.type === 'text') {
    const textShape = shape as CanvasTextShape;
    const textWidth = estimateTextWidth(textShape.text, textShape.fontSize);
    const textHeight = textShape.fontSize;
    const halfWidth = textWidth / 2;
    const halfHeight = textHeight / 2;
    const transform = `translate(${x} ${y}) rotate(${rotationDeg})`;
    const isEditingText = editingTextId === shape.id;
    return (
      <g data-shape={shape.id} transform={transform} style={{ cursor: 'pointer' }}>
        {isEditingText ? (
          <foreignObject
            x={-halfWidth}
            y={-halfHeight}
            width={textWidth}
            height={textHeight}
            pointerEvents="all"
          >
            <div
              ref={textInputRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              onInput={(event) => onTextInput(event.currentTarget.textContent ?? '')}
              onKeyDown={onTextKeyDown}
              onBlur={onTextBlur}
              onPointerDown={(event) => event.stopPropagation()}
              className="flex h-full w-full flex-col rounded border border-blue-500/60 bg-slate-900/80 px-1 py-0.5 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              style={{
                fontSize: `${textShape.fontSize}mm`,
                lineHeight: 1.1,
                whiteSpace: 'pre-wrap',
              }}
            >
              {editingTextValue}
            </div>
          </foreignObject>
        ) : (
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={textShape.fontSize}
            className="fill-slate-100"
            onDoubleClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              onTextDoubleClick(textShape);
            }}
          >
            {textShape.text}
          </text>
        )}
        {isSelected && !isEditingText && (
          <rect
            x={-halfWidth}
            y={-halfHeight}
            width={textWidth}
            height={textHeight}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        )}
      </g>
    );
  }

  return null;
});

// Extracted to avoid repeating dimension geometry rendering
type DimensionShapeSvgProps = {
  shape: CanvasDimensionShape;
  x: number;
  y: number;
  rotationDeg: number;
  strokeColor: string;
  strokeWidth: number;
};

function DimensionShapeSvg({
  shape,
  x,
  y,
  rotationDeg,
  strokeColor,
  strokeWidth,
}: DimensionShapeSvgProps) {
  const geometry = getDimensionGeometry({ ...shape, x, y, rotationDeg });
  const tickHalf = DIMENSION_TICK_LENGTH_MM / 2;
  const tickDir = geometry.normal;
  const label = formatDimensionLabel(shape);
  const fontSize = 8;
  const labelPos = {
    x: (geometry.offsetStart.x + geometry.offsetEnd.x) / 2,
    y: (geometry.offsetStart.y + geometry.offsetEnd.y) / 2,
  };
  const textRotation = rotationDeg > 90 && rotationDeg < 270 ? rotationDeg - 180 : rotationDeg;
  const labelBgWidth = estimateTextWidth(label, fontSize) + DIMENSION_TEXT_PADDING_MM * 2;
  const labelBgHeight = fontSize + DIMENSION_TEXT_PADDING_MM * 2;

  return (
    <g data-shape={shape.id} style={{ cursor: 'pointer' }}>
      <line
        x1={geometry.start.x}
        y1={geometry.start.y}
        x2={geometry.offsetStart.x}
        y2={geometry.offsetStart.y}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={0.8}
      />
      <line
        x1={geometry.end.x}
        y1={geometry.end.y}
        x2={geometry.offsetEnd.x}
        y2={geometry.offsetEnd.y}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={0.8}
      />
      <line
        x1={geometry.offsetStart.x}
        y1={geometry.offsetStart.y}
        x2={geometry.offsetEnd.x}
        y2={geometry.offsetEnd.y}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1={geometry.offsetStart.x - tickDir.x * tickHalf}
        y1={geometry.offsetStart.y - tickDir.y * tickHalf}
        x2={geometry.offsetStart.x + tickDir.x * tickHalf}
        y2={geometry.offsetStart.y + tickDir.y * tickHalf}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1={geometry.offsetEnd.x - tickDir.x * tickHalf}
        y1={geometry.offsetEnd.y - tickDir.y * tickHalf}
        x2={geometry.offsetEnd.x + tickDir.x * tickHalf}
        y2={geometry.offsetEnd.y + tickDir.y * tickHalf}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <g transform={`translate(${labelPos.x} ${labelPos.y}) rotate(${textRotation})`}>
        <rect
          x={-labelBgWidth / 2}
          y={-labelBgHeight / 2}
          width={labelBgWidth}
          height={labelBgHeight}
          fill="rgba(15, 23, 42, 0.85)"
          stroke={strokeColor}
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
