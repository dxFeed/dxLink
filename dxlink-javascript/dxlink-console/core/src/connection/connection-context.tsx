import type { DXLinkClient } from '@dxfeed/dxlink-api'
import { useAtomValue } from '@effect/atom-react'
import { createContext, useContext } from 'react'

import type { ConnectionModel } from './connection-model'

const ConnectionContext = createContext<ConnectionModel | null>(null)
ConnectionContext.displayName = 'ConnectionModel'

/** Provides the page-scoped {@link ConnectionModel} to the console subtree. */
export const ConnectionProvider = ConnectionContext.Provider

/** Read the page's {@link ConnectionModel} (throws if used outside the provider). */
export const useConnection = (): ConnectionModel => {
  const value = useContext(ConnectionContext)
  if (value === null) {
    throw new Error('ConnectionModel: used outside of its provider')
  }

  return value
}

/**
 * The live client, for a channel to open its channel on.
 *
 * Channels are only rendered once the connection is authorized, so there is always one; if
 * there is not — the connection vanished between opening the dialog and mounting the card —
 * this throws, and the card's error boundary contains it.
 */
export const useConnectionClient = (): DXLinkClient => {
  const client = useAtomValue(useConnection().client)
  if (client === null) {
    throw new Error('Channel opened without an active connection')
  }

  return client
}
