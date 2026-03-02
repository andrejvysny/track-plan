import { memo, type PointerEvent as ReactPointerEvent } from 'react';
import type {
  ConnectorKey,
  EndpointRef,
  TrackComponentDefinition,
} from '../../../types/trackSystem';
import type { PlacedItem } from '../../../types/layout';
import type { ConnectorEntry } from '../../../utils/shapeGeometry';
import { computeLabelAnchor } from '../../../utils/shapeGeometry';
import { rotatePointLocal } from '../../../geometry/trackGeometry';
import {
  TRACK_STROKE_WIDTH_MM,
  LABEL_OFFSET_MM,
  ENDPOINT_CIRCLE_RADIUS,
  ENDPOINT_VECTOR_LENGTH_MM,
} from '../../../constants/layout';

type WorldTransformPreview = {
  x: number;
  y: number;
  rotationDeg: number;
};

// Canvas-specific colors
const TRACK_FILL_COLOR = '#1f2937';
const TRACK_BORDER_COLOR = 'darkgrey';
const SELECTED_TRACK_BORDER_COLOR = '#60a5fa';
const SELECTED_ENDPOINT_COLOR = '#dc2626';
const CONNECTED_ENDPOINT_COLOR = '#16a34a';
const GROUNDED_TRACK_BORDER_COLOR = '#facc15';

const getComponentFillColor = (component: TrackComponentDefinition) =>
  component.color ?? TRACK_FILL_COLOR;

export type TrackItemRendererProps = {
  item: PlacedItem;
  component: TrackComponentDefinition;
  pathD: string;
  connectorEntries: ConnectorEntry[];
  transform: WorldTransformPreview;
  isSelected: boolean;
  showColors: boolean;
  debugMode: boolean;
  selectedEndpoints: EndpointRef[];
  isEndpointConnected: (itemId: string, connectorKey: ConnectorKey) => boolean;
  onItemPointerDown: (
    event: ReactPointerEvent<SVGElement>,
    itemId: string,
    transform: WorldTransformPreview
  ) => void;
  onEndpointPointerDown: (endpoint: EndpointRef, additive: boolean) => void;
};

export const TrackItemRenderer = memo(function TrackItemRenderer({
  item,
  component,
  pathD,
  connectorEntries,
  transform,
  isSelected,
  showColors,
  debugMode,
  selectedEndpoints,
  isEndpointConnected,
  onItemPointerDown,
  onEndpointPointerDown,
}: TrackItemRendererProps) {
  const isGrounded = item.isGrounded ?? false;
  const labelAnchor = computeLabelAnchor(connectorEntries);
  const trackStrokeColor =
    isGrounded && !isSelected
      ? GROUNDED_TRACK_BORDER_COLOR
      : isSelected
        ? SELECTED_TRACK_BORDER_COLOR
        : TRACK_BORDER_COLOR;
  const rotatedLabelAnchor = rotatePointLocal(
    labelAnchor.xMm,
    labelAnchor.yMm,
    transform.rotationDeg
  );
  const labelOffsetPoint = rotatePointLocal(0, -LABEL_OFFSET_MM, transform.rotationDeg);
  const labelX = transform.x + rotatedLabelAnchor.x + labelOffsetPoint.x;
  const labelY = transform.y + rotatedLabelAnchor.y + labelOffsetPoint.y;

  return (
    <g>
      <g
        data-track-item={item.id}
        transform={`translate(${transform.x} ${transform.y}) rotate(${transform.rotationDeg})`}
        onPointerDown={(event) => onItemPointerDown(event, item.id, transform)}
      >
        <path
          d={pathD}
          fill="none"
          stroke={showColors ? getComponentFillColor(component) : TRACK_FILL_COLOR}
          strokeWidth={TRACK_STROKE_WIDTH_MM}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        {(isSelected || isGrounded) && (
          <path
            d={pathD}
            fill="none"
            stroke={trackStrokeColor}
            strokeWidth={TRACK_STROKE_WIDTH_MM}
            strokeLinecap="butt"
            strokeLinejoin="miter"
            opacity={0.5}
            pointerEvents="none"
          />
        )}
        {!showColors &&
          connectorEntries.map(({ key, local }) => {
            const isEndpointSelected = selectedEndpoints.some(
              (endpoint) => endpoint.itemId === item.id && endpoint.connectorKey === key
            );
            const isConnected = isEndpointConnected(item.id, key);
            const endpointFill = isEndpointSelected
              ? SELECTED_ENDPOINT_COLOR
              : isConnected
                ? CONNECTED_ENDPOINT_COLOR
                : 'transparent';
            const endpointStroke = isEndpointSelected
              ? SELECTED_ENDPOINT_COLOR
              : isConnected
                ? CONNECTED_ENDPOINT_COLOR
                : '#cbd5f5';
            const vectorEndX = local.xMm + (local.dir?.x ?? 0) * ENDPOINT_VECTOR_LENGTH_MM;
            const vectorEndY = local.yMm + (local.dir?.y ?? 0) * ENDPOINT_VECTOR_LENGTH_MM;
            const epLabelOffsetX = (local.dir?.x ?? 0) * (ENDPOINT_VECTOR_LENGTH_MM + 8);
            const epLabelOffsetY = (local.dir?.y ?? 0) * (ENDPOINT_VECTOR_LENGTH_MM + 8);
            const epLabelX = local.xMm + epLabelOffsetX;
            const epLabelY = local.yMm + epLabelOffsetY;
            const directionDeg = local.directionDeg ?? 0;
            return (
              <g key={`${item.id}-${key}`}>
                {debugMode && (
                  <line
                    x1={local.xMm}
                    y1={local.yMm}
                    x2={vectorEndX}
                    y2={vectorEndY}
                    stroke={endpointStroke}
                    strokeWidth={isEndpointSelected || isConnected ? 2 : 1}
                    opacity={0.7}
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={local.xMm}
                  cy={local.yMm}
                  r={ENDPOINT_CIRCLE_RADIUS}
                  fill={endpointFill}
                  stroke={endpointStroke}
                  strokeWidth={isEndpointSelected || isConnected ? 2 : 1}
                  opacity={0.8}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    onEndpointPointerDown({ itemId: item.id, connectorKey: key }, event.shiftKey);
                  }}
                />
                {debugMode && (
                  <g pointerEvents="none">
                    <rect
                      x={epLabelX - 20}
                      y={epLabelY - 8}
                      width={40}
                      height={20}
                      fill="rgba(0, 0, 0, 0.7)"
                      rx={2}
                    />
                    <text
                      x={epLabelX}
                      y={epLabelY}
                      fontSize={8}
                      fill="#ffffff"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ userSelect: 'none', fontFamily: 'monospace' }}
                    >
                      <tspan x={epLabelX} dy="0">
                        {key}
                      </tspan>
                      <tspan x={epLabelX} dy="10">
                        {directionDeg.toFixed(1)}°
                      </tspan>
                    </text>
                  </g>
                )}
              </g>
            );
          })}
      </g>
      <text
        data-track-item={item.id}
        x={labelX}
        y={labelY}
        textAnchor="middle"
        fontSize={10}
        className="fill-gray-300"
        onPointerDown={(event) => onItemPointerDown(event, item.id, transform)}
      >
        {component.id}
      </text>
    </g>
  );
});
