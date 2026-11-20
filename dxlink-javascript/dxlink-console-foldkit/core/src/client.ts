import { Effect } from 'effect'
import { ManagedResource } from 'foldkit'

import type { DXLinkWebSocketClient } from '@dxfeed/dxlink-api'

/**
 * The client of the current session, together with the session it was built for.
 *
 * The session id travels with the client so that whoever reads the resource can tell a client
 * that belongs to the session in the Model from one that is about to be released.
 */
export const DxLinkSession =
  ManagedResource.tag<Readonly<{ sessionId: number; client: DXLinkWebSocketClient }>>()(
    'DxLinkSession'
  )

/**
 * The dxLink client of the current session.
 *
 * One client serves the whole console: every open channel shares it, and it exists exactly
 * while the Model holds a session. Channel plugins read it with `DxLinkClient.get` inside
 * their Commands, which fails with `ResourceNotAvailable` when no session is open.
 */
export const DxLinkClient = {
  get: Effect.map(DxLinkSession.get, ({ client }) => client),
}

/** The service a Command or Subscription requires in order to read {@link DxLinkClient}. */
export type DxLinkClientService = ManagedResource.ServiceOf<typeof DxLinkSession>
