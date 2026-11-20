import { ManagedResource } from 'foldkit'

import type { DXLinkWebSocketClient } from '@dxfeed/dxlink-api'

/**
 * The dxLink client of the current session.
 *
 * One client serves the whole console: every open channel shares it, and it exists exactly
 * while the Model holds a session. Channel plugins read it with `DxLinkClient.get` inside
 * their Commands, which fails with `ResourceNotAvailable` when no session is open.
 */
export const DxLinkClient = ManagedResource.tag<DXLinkWebSocketClient>()('DxLinkClient')

/** The service a Command or Subscription requires in order to read {@link DxLinkClient}. */
export type DxLinkClientService = ManagedResource.ServiceOf<typeof DxLinkClient>
