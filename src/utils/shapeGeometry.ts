import type { CanvasDimensionShape } from '../types/layout';
import type { ConnectorKey, TrackConnector } from '../types/trackSystem';
import type { ComponentGeometry } from '../types/trackSystem';

export type ConnectorEntry = {
  key: ConnectorKey;
  local: TrackConnector;
};

export const listConnectorEntries = (geometry: ComponentGeometry): ConnectorEntry[] => {
  const entries: ConnectorEntry[] = [
    { key: 'start', local: geometry.start },
    { key: 'end', local: geometry.end },
  ];
  if (geometry.extraConnectors) {
    Object.entries(geometry.extraConnectors).forEach(([key, connector]) => {
      entries.push({ key, local: connector });
    });
  }
  return entries;
};

export const computeLabelAnchor = (connectors: ConnectorEntry[]) => {
  if (!connectors.length) {
    return { xMm: 0, yMm: 0 };
  }
  const totals = connectors.reduce(
    (acc, entry) => {
      acc.x += entry.local.xMm;
      acc.y += entry.local.yMm;
      return acc;
    },
    { x: 0, y: 0 }
  );
  return {
    xMm: totals.x / connectors.length,
    yMm: totals.y / connectors.length,
  };
};

export const getDimensionGeometry = (shape: CanvasDimensionShape) => {
  const angleRad = (shape.rotationDeg / 180) * Math.PI;
  const dir = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  const normal = { x: -dir.y, y: dir.x };
  const half = shape.length / 2;
  const start = { x: shape.x - dir.x * half, y: shape.y - dir.y * half };
  const end = { x: shape.x + dir.x * half, y: shape.y + dir.y * half };
  const offsetStart = {
    x: start.x + normal.x * shape.offsetMm,
    y: start.y + normal.y * shape.offsetMm,
  };
  const offsetEnd = {
    x: end.x + normal.x * shape.offsetMm,
    y: end.y + normal.y * shape.offsetMm,
  };
  return { start, end, offsetStart, offsetEnd, dir, normal };
};

export const formatDimensionLabel = (shape: CanvasDimensionShape) =>
  shape.label ?? `${shape.length.toFixed(1)} mm`;

export const isDimensionShape = (shape: { type: string }): shape is CanvasDimensionShape =>
  shape.type === 'dimension';

export const estimateTextWidth = (text: string, fontSize: number, charWidthFactor: number) => {
  const length = Math.max(text.length, 1);
  return length * fontSize * charWidthFactor;
};
