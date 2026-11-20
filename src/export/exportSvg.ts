import type {
  CanvasDimensionShape,
  CanvasPrimitiveShape,
  CanvasShape,
  CanvasTextShape,
  LayoutState,
} from '../types/layout';
import type { TrackComponentDefinition, TrackSystemDefinition } from '../types/trackSystem';
import { getComponentGeometry, rotatePointLocal } from '../geometry/trackGeometry';
import { type Bounds, expandBounds, mergeBounds, pointsToBounds } from '../geometry/geometryUtils';
import {
  TEXT_CHAR_WIDTH_FACTOR,
  TEXT_DEFAULT_HEIGHT_MM,
  TEXT_DEFAULT_WIDTH_MM,
  TRACK_STROKE_WIDTH_MM,
  LABEL_OFFSET_MM,
  LABEL_FONT_SIZE,
  SHAPE_STROKE_WIDTH,
  DIMENSION_TICK_LENGTH_MM,
  DIMENSION_TEXT_PADDING_MM,
  DIMENSION_FONT_SIZE,
  METADATA_FONT_SIZE,
  CANVAS_OUTLINE_STROKE_WIDTH,
  METADATA_SPACING,
} from '../constants/layout';
import {
  computeLabelAnchor,
  formatDimensionLabel,
  getDimensionGeometry,
  isDimensionShape,
  listConnectorEntries,
  estimateTextWidth,
  boardPathD,
  boardVertices,
} from '../utils/shapeGeometry';

const EXPORT_BLACK = '#000';

const getLocalBounds = (component: TrackComponentDefinition, trackWidth: number): Bounds => {
  if (component.type === 'straight' && component.lengthMm) {
    const half = component.lengthMm / 2;
    return { minX: -half, maxX: half, minY: -trackWidth, maxY: trackWidth };
  }

  if ((component.type === 'curve' || component.type === 'switch') && component.radiusMm) {
    const r = component.radiusMm;
    return { minX: -r, maxX: r, minY: -r, maxY: r };
  }

  return { minX: -50, maxX: 50, minY: -10, maxY: 10 };
};

const transformBounds = (bounds: Bounds, x: number, y: number, rotationDeg: number): Bounds => {
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];

  const transformed = corners.map((corner) => {
    const rotated = rotatePointLocal(corner.x, corner.y, rotationDeg);
    return { x: rotated.x + x, y: rotated.y + y };
  });

  return pointsToBounds(transformed);
};

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const trackBoundsPadding = TRACK_STROKE_WIDTH_MM / 4;

const localEstimateTextWidth = (text: string, fontSize: number) =>
  estimateTextWidth(text, fontSize, TEXT_CHAR_WIDTH_FACTOR);

type TrackUsageEntry = {
  componentId: string;
  label: string;
  count: number;
};

const buildTrackUsageList = (
  usageData: TrackUsageEntry[],
  bounds: Bounds,
  paddingMm: number
): string => {
  if (!usageData.length) return '';

  const fontSize = METADATA_FONT_SIZE;
  const lineHeight = fontSize * 1.3;
  const listPadding = 4;
  const startX = bounds.maxX - paddingMm / 2;
  const startY = bounds.maxY - paddingMm / 2;

  const title = 'Track Usage:';
  const titleY = startY - usageData.length * lineHeight - listPadding * 2;

  const entries = usageData
    .map((entry, index) => {
      const text = `${entry.label}: ${entry.count}x`;
      const y = titleY + lineHeight + index * lineHeight + listPadding;
      return `<text x="${startX}" y="${y}" text-anchor="end" font-size="${fontSize}" fill="${EXPORT_BLACK}">${escapeXml(text)}</text>`;
    })
    .join('\n');

  return `
    <g id="track-usage-list">
      <text x="${startX}" y="${titleY}" text-anchor="end" font-size="${fontSize}" font-weight="bold" fill="${EXPORT_BLACK}">${title}</text>
      ${entries}
    </g>
  `;
};

const buildDimensionsDisplay = (
  bounds: Bounds,
  paddingMm: number,
  trackUsageCount: number
): string => {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const fontSize = METADATA_FONT_SIZE;
  const lineHeight = fontSize * 1.3;

  const startX = bounds.maxX - paddingMm / 2;
  const trackUsageHeight = trackUsageCount * lineHeight + lineHeight + METADATA_SPACING;
  const startY = bounds.maxY - paddingMm / 2 - trackUsageHeight - METADATA_SPACING;

  const dimensionText = `Dimensions: ${width.toFixed(1)} × ${height.toFixed(1)} mm`;

  return `
    <g id="dimensions-display">
      <text x="${startX}" y="${startY}" text-anchor="end" font-size="${fontSize}" font-weight="bold" fill="${EXPORT_BLACK}">${escapeXml(dimensionText)}</text>
    </g>
  `;
};

const buildCanvasOutline = (bounds: Bounds): string => {
  const x = bounds.minX;
  const y = bounds.minY;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  return `
    <rect
      x="${x}"
      y="${y}"
      width="${width}"
      height="${height}"
      fill="none"
      stroke="${EXPORT_BLACK}"
      stroke-width="${CANVAS_OUTLINE_STROKE_WIDTH}"
    />
  `;
};

const getShapeBounds = (shape: CanvasShape): Bounds => {
  if (isDimensionShape(shape)) {
    const geometry = getDimensionGeometry(shape);
    const tickHalf = DIMENSION_TICK_LENGTH_MM / 2;
    const tickDir = geometry.normal;
    const label = formatDimensionLabel(shape);
    const labelBgWidth =
      localEstimateTextWidth(label, DIMENSION_FONT_SIZE) + DIMENSION_TEXT_PADDING_MM * 2;
    const labelBgHeight = DIMENSION_FONT_SIZE + DIMENSION_TEXT_PADDING_MM * 2;
    const labelCenter = {
      x: (geometry.offsetStart.x + geometry.offsetEnd.x) / 2,
      y: (geometry.offsetStart.y + geometry.offsetEnd.y) / 2,
    };
    const textRotation =
      shape.rotationDeg > 90 && shape.rotationDeg < 270
        ? shape.rotationDeg - 180
        : shape.rotationDeg;
    const labelCorners = [
      { x: -labelBgWidth / 2, y: -labelBgHeight / 2 },
      { x: labelBgWidth / 2, y: -labelBgHeight / 2 },
      { x: labelBgWidth / 2, y: labelBgHeight / 2 },
      { x: -labelBgWidth / 2, y: labelBgHeight / 2 },
    ].map((corner) => rotatePointLocal(corner.x, corner.y, textRotation));

    const points = [
      geometry.start,
      geometry.end,
      geometry.offsetStart,
      geometry.offsetEnd,
      {
        x: geometry.offsetStart.x + tickDir.x * tickHalf,
        y: geometry.offsetStart.y + tickDir.y * tickHalf,
      },
      {
        x: geometry.offsetStart.x - tickDir.x * tickHalf,
        y: geometry.offsetStart.y - tickDir.y * tickHalf,
      },
      {
        x: geometry.offsetEnd.x + tickDir.x * tickHalf,
        y: geometry.offsetEnd.y + tickDir.y * tickHalf,
      },
      {
        x: geometry.offsetEnd.x - tickDir.x * tickHalf,
        y: geometry.offsetEnd.y - tickDir.y * tickHalf,
      },
      ...labelCorners.map((corner) => ({
        x: corner.x + labelCenter.x,
        y: corner.y + labelCenter.y,
      })),
    ];

    return expandBounds(pointsToBounds(points), SHAPE_STROKE_WIDTH / 2);
  }

  if (shape.type === 'line') {
    return expandBounds(
      pointsToBounds([
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
      ]),
      SHAPE_STROKE_WIDTH / 2
    );
  }

  if (shape.type === 'circle') {
    const radius = shape.width / 2;
    const bounds: Bounds = {
      minX: shape.x - radius,
      maxX: shape.x + radius,
      minY: shape.y - radius,
      maxY: shape.y + radius,
    };
    return expandBounds(bounds, SHAPE_STROKE_WIDTH / 2);
  }

  if (shape.type === 'text') {
    const textShape = shape as CanvasTextShape;
    const textWidth = textShape.width ?? TEXT_DEFAULT_WIDTH_MM;
    const textHeight = textShape.height ?? TEXT_DEFAULT_HEIGHT_MM;
    const halfTextWidth = textWidth / 2;
    const halfTextHeight = textHeight / 2;
    const corners = [
      { x: -halfTextWidth, y: -halfTextHeight },
      { x: halfTextWidth, y: -halfTextHeight },
      { x: halfTextWidth, y: halfTextHeight },
      { x: -halfTextWidth, y: halfTextHeight },
    ];
    const rotated = corners.map((corner) =>
      rotatePointLocal(corner.x, corner.y, shape.rotationDeg)
    );
    const world = rotated.map((point) => ({ x: point.x + shape.x, y: point.y + shape.y }));
    return expandBounds(pointsToBounds(world), SHAPE_STROKE_WIDTH / 2);
  }

  const primitive = shape as CanvasPrimitiveShape;
  const height = primitive.height ?? primitive.width;
  const halfHeight = height / 2;
  const halfWidth = primitive.width / 2;
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];

  const rotated = corners.map((corner) =>
    rotatePointLocal(corner.x, corner.y, primitive.rotationDeg)
  );
  const world = rotated.map((point) => ({
    x: point.x + primitive.x,
    y: point.y + primitive.y,
  }));
  return expandBounds(pointsToBounds(world), SHAPE_STROKE_WIDTH / 2);
};

const buildShapeElement = (shape: CanvasShape) => {
  if (shape.type === 'line') {
    return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" stroke-linecap="round"/>`;
  }

  const rotationTransform = `rotate(${shape.rotationDeg} ${shape.x} ${shape.y})`;
  const shapeType = shape.type;

  if (shapeType === 'dimension') {
    const dimensionShape = shape as CanvasDimensionShape;
    const geometry = getDimensionGeometry(dimensionShape);
    const tickHalf = DIMENSION_TICK_LENGTH_MM / 2;
    const tickDir = geometry.normal;
    const label = formatDimensionLabel(dimensionShape);
    const labelPos = {
      x: (geometry.offsetStart.x + geometry.offsetEnd.x) / 2,
      y: (geometry.offsetStart.y + geometry.offsetEnd.y) / 2,
    };
    const textRotation =
      dimensionShape.rotationDeg > 90 && dimensionShape.rotationDeg < 270
        ? dimensionShape.rotationDeg - 180
        : dimensionShape.rotationDeg;
    const labelBgWidth =
      localEstimateTextWidth(label, DIMENSION_FONT_SIZE) + DIMENSION_TEXT_PADDING_MM * 2;
    const labelBgHeight = DIMENSION_FONT_SIZE + DIMENSION_TEXT_PADDING_MM * 2;

    return `
      <g>
        <line x1="${geometry.start.x}" y1="${geometry.start.y}" x2="${geometry.offsetStart.x}" y2="${geometry.offsetStart.y}" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" stroke-linecap="round" />
        <line x1="${geometry.end.x}" y1="${geometry.end.y}" x2="${geometry.offsetEnd.x}" y2="${geometry.offsetEnd.y}" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" stroke-linecap="round" />
        <line x1="${geometry.offsetStart.x}" y1="${geometry.offsetStart.y}" x2="${geometry.offsetEnd.x}" y2="${geometry.offsetEnd.y}" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" stroke-linecap="round" />
        <line x1="${geometry.offsetStart.x - tickDir.x * tickHalf}" y1="${geometry.offsetStart.y - tickDir.y * tickHalf}" x2="${geometry.offsetStart.x + tickDir.x * tickHalf}" y2="${geometry.offsetStart.y + tickDir.y * tickHalf}" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" stroke-linecap="round" />
        <line x1="${geometry.offsetEnd.x - tickDir.x * tickHalf}" y1="${geometry.offsetEnd.y - tickDir.y * tickHalf}" x2="${geometry.offsetEnd.x + tickDir.x * tickHalf}" y2="${geometry.offsetEnd.y + tickDir.y * tickHalf}" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" stroke-linecap="round" />
        <g transform="translate(${labelPos.x} ${labelPos.y}) rotate(${textRotation})">
          <rect x="${-labelBgWidth / 2}" y="${-labelBgHeight / 2}" width="${labelBgWidth}" height="${labelBgHeight}" fill="${EXPORT_BLACK}" stroke="${EXPORT_BLACK}" stroke-width="1" rx="2" />
          <text x="0" y="${DIMENSION_FONT_SIZE / 3}" text-anchor="middle" font-size="${DIMENSION_FONT_SIZE}" fill="white">${escapeXml(label)}</text>
        </g>
      </g>\n`;
  }

  if (shapeType === 'circle') {
    const radius = shape.width / 2;
    return `<circle cx="${shape.x}" cy="${shape.y}" r="${radius}" fill="none" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" transform="${rotationTransform}"/>`;
  }

  if (shapeType === 'text') {
    const textShape = shape as CanvasTextShape;
    return `<text x="${textShape.x}" y="${textShape.y}" text-anchor="middle" dominant-baseline="middle" font-size="${textShape.fontSize}" fill="${EXPORT_BLACK}" transform="${rotationTransform}">${escapeXml(textShape.text)}</text>`;
  }

  // Rectangle (includes legacy squares)
  const primitive = shape as CanvasPrimitiveShape;
  const height = primitive.height ?? primitive.width;
  const halfHeight = height / 2;
  const x = primitive.x - primitive.width / 2;
  const y = primitive.y - halfHeight;
  return `<rect x="${x}" y="${y}" width="${primitive.width}" height="${height}" fill="none" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" transform="${rotationTransform}"/>`;
};

export function buildLayoutSvgString(
  layout: LayoutState,
  trackSystem: TrackSystemDefinition,
  options?: { paddingMm?: number; trackUsage?: TrackUsageEntry[] }
) {
  const padding = options?.paddingMm ?? 2;
  const componentMap = new Map<string, TrackComponentDefinition>();
  trackSystem.components.forEach((component) => componentMap.set(component.id, component));

  const trackElements: string[] = [];
  const shapeElements: string[] = [];
  const baseplaneElements: string[] = [];
  let bounds: Bounds | null = null;

  layout.basePlane?.boards.forEach((board) => {
    baseplaneElements.push(
      `<path d="${boardPathD(board)}" fill="none" stroke="${EXPORT_BLACK}" stroke-width="${SHAPE_STROKE_WIDTH}" stroke-dasharray="14 8"/>`
    );
    bounds = mergeBounds(
      bounds,
      expandBounds(pointsToBounds(boardVertices(board)), SHAPE_STROKE_WIDTH / 2)
    );
  });

  layout.placedItems.forEach((item) => {
    const component = componentMap.get(item.componentId);
    if (!component) return;
    const geometry = getComponentGeometry(component);

    const connectorEntries = listConnectorEntries(geometry);
    const labelAnchor = computeLabelAnchor(connectorEntries);
    const rotatedLabelAnchor = rotatePointLocal(labelAnchor.xMm, labelAnchor.yMm, item.rotationDeg);
    const labelOffsetPoint = rotatePointLocal(0, -LABEL_OFFSET_MM, item.rotationDeg);
    const labelX = item.x + rotatedLabelAnchor.x + labelOffsetPoint.x;
    const labelY = item.y + rotatedLabelAnchor.y + labelOffsetPoint.y;

    const path = geometry.buildPathD();
    const trackColor = component.color ?? EXPORT_BLACK;

    trackElements.push(
      `
      <g>
        <g transform="translate(${item.x} ${item.y}) rotate(${item.rotationDeg})">
          <path
            d="${path}"
            fill="${trackColor}"
            stroke="${trackColor}"
            stroke-width="${TRACK_STROKE_WIDTH_MM}"
            stroke-linecap="butt"
            stroke-linejoin="miter"
          />
        </g>
        <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="${LABEL_FONT_SIZE}" font-weight="bold" fill="${EXPORT_BLACK}">${escapeXml(
          component.id
        )}</text>
      </g>
    `.trim()
    );

    const localBounds = expandBounds(
      getLocalBounds(component, TRACK_STROKE_WIDTH_MM),
      trackBoundsPadding
    );
    const worldBounds = transformBounds(localBounds, item.x, item.y, item.rotationDeg);
    bounds = mergeBounds(bounds, worldBounds);
  });

  layout.shapes.forEach((shape) => {
    shapeElements.push(buildShapeElement(shape));
    bounds = mergeBounds(bounds, getShapeBounds(shape));
  });

  if (!bounds) {
    const emptyView = expandBounds({ minX: -100, maxX: 100, minY: -100, maxY: 100 }, padding);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${emptyView.minX} ${emptyView.minY} ${emptyView.maxX - emptyView.minX} ${emptyView.maxY - emptyView.minY}" fill="none"></svg>`;
  }

  const padded = expandBounds(bounds, padding);
  const width = padded.maxX - padded.minX;
  const height = padded.maxY - padded.minY;

  const canvasOutline = buildCanvasOutline(padded);

  const trackUsageData = options?.trackUsage ?? [];
  const trackUsageList = trackUsageData.length
    ? buildTrackUsageList(trackUsageData, padded, padding)
    : '';
  const dimensionsDisplay = buildDimensionsDisplay(bounds, padding, trackUsageData.length);

  const content = [
    canvasOutline,
    ...baseplaneElements,
    ...trackElements,
    ...shapeElements,
    trackUsageList,
    dimensionsDisplay,
  ]
    .filter(Boolean)
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${padded.minX} ${padded.minY} ${width} ${height}" fill="none">${content}</svg>`;
}
