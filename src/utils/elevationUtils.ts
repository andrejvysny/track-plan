import type { LayoutState, PlacedItem, EndpointConnection } from '../types/layout';

/**
 * Propagate elevation from a changed item through connected endpoints.
 * BFS through the connection graph — connected endpoints share elevation values.
 */
export function propagateElevation(
  layout: LayoutState,
  changedItemId: string,
  changedKey: 'start' | 'end',
  newMm: number
): PlacedItem[] {
  const itemMap = new Map(layout.placedItems.map((item) => [item.id, { ...item }]));
  const changed = itemMap.get(changedItemId);
  if (!changed) return layout.placedItems;

  // Apply the direct change
  if (changedKey === 'start') {
    changed.elevationStartMm = newMm;
  } else {
    changed.elevationEndMm = newMm;
  }

  // BFS through connections
  const visited = new Set<string>();
  const queue: { itemId: string; connectorKey: string; elevation: number }[] = [
    { itemId: changedItemId, connectorKey: changedKey, elevation: newMm },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const visitKey = `${current.itemId}:${current.connectorKey}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    // Find connections at this endpoint
    for (const conn of layout.connections) {
      const match = findMatchingEndpoint(conn, current.itemId, current.connectorKey);
      if (!match) continue;

      const peerKey = `${match.itemId}:${match.connectorKey}`;
      if (visited.has(peerKey)) continue;

      const peer = itemMap.get(match.itemId);
      if (!peer) continue;

      // Set peer's elevation at the connected endpoint
      if (match.connectorKey === 'start') {
        peer.elevationStartMm = current.elevation;
      } else if (match.connectorKey === 'end') {
        peer.elevationEndMm = current.elevation;
      }

      queue.push({
        itemId: match.itemId,
        connectorKey: match.connectorKey,
        elevation: current.elevation,
      });
    }
  }

  return Array.from(itemMap.values());
}

function findMatchingEndpoint(
  conn: EndpointConnection,
  itemId: string,
  connectorKey: string
): { itemId: string; connectorKey: string } | null {
  const [a, b] = conn.endpoints;
  if (a.itemId === itemId && a.connectorKey === connectorKey) {
    return { itemId: b.itemId, connectorKey: b.connectorKey };
  }
  if (b.itemId === itemId && b.connectorKey === connectorKey) {
    return { itemId: a.itemId, connectorKey: a.connectorKey };
  }
  return null;
}
