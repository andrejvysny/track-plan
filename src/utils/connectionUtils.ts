import type { EndpointConnection } from '../types/layout'
import type { EndpointRef } from '../types/trackSystem'

export const endpointsEqual = (a: EndpointRef, b: EndpointRef) =>
  a.itemId === b.itemId && a.connectorKey === b.connectorKey

export const connectionMatchesEndpoints = (connection: EndpointConnection, endpoints: EndpointRef[]) => {
  if (endpoints.length !== 2) return false
  const [first, second] = endpoints
  const [a, b] = connection.endpoints
  return (
    (endpointsEqual(a, first) && endpointsEqual(b, second)) ||
    (endpointsEqual(a, second) && endpointsEqual(b, first))
  )
}

export const connectionHasEndpoint = (connection: EndpointConnection, endpoint: EndpointRef) =>
  connection.endpoints.some((candidate) => endpointsEqual(candidate, endpoint))
