import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'
import Stack from '@mui/material/Stack'
import { useMemo } from 'react'

import { AuthPanel } from '../features/auth/auth-panel'
import { ChannelsArea } from '../features/channels/channels-area'
import { ConnectionProvider } from '../features/connection/connection-context'
import { ConnectionPanel } from '../features/connection/connection-panel'
import { ConnectionViewModel } from '../features/connection/connection-view-model'
import { resolveConsoleConfig } from '../shared/lib/console-config'
import type { ConsoleConfig } from '../shared/lib/console-config'
import { ConsoleConfigProvider } from '../shared/lib/console-config-context'
import { useOwnedViewModel, useVM } from '../shared/view-model'

export interface ConsolePageProps {
  /** Initial values for the console's forms; see {@link ConsoleConfig}. */
  config?: ConsoleConfig
}

/**
 * Console page. Owns the page-scoped {@link ConnectionViewModel} (disposed on
 * unmount → closes the socket) and provides it to the subtree. Tri-state gating:
 *  - not connected → connection panel only,
 *  - connected + auth UNAUTHORIZED/AUTHORIZING → auth panel,
 *  - authorized (now or earlier this session) → channels area.
 *
 * The channels area is gated on `everAuthorized` rather than the live `authorized`
 * state so it stays mounted through a reconnect: the same client re-opens its
 * channels itself, and we keep the open channel cards instead of tearing them down
 * on the brief connection / auth flicker. It is keyed by `sessionId`, which bumps
 * only on a fresh connect (new client) — so a new connection starts empty while a
 * reconnect preserves the channels. `auth === undefined` (not yet known) shows
 * neither panel, avoiding a token-form flash on no-auth servers.
 *
 * `config` is what makes the page embeddable: a host passes the profile the forms start
 * from instead of the page reaching for globals. Omitted, it falls back to the page
 * location alone — enough for a standalone console, and free of any build-time assumption.
 */
export const ConsolePage = ({ config }: ConsolePageProps) => {
  const vm = useOwnedViewModel(() => new ConnectionViewModel())
  const resolved = useMemo(
    () => config ?? resolveConsoleConfig({ location: window.location }),
    [config]
  )
  const connection = useVM(vm, (s) => s.connection)
  const auth = useVM(vm, (s) => s.auth)
  const sessionId = useVM(vm, (s) => s.sessionId)
  const everAuthorized = useVM(vm, (s) => s.everAuthorized)

  const connected = connection === DXLinkConnectionState.CONNECTED
  const needsAuth =
    connected && (auth === DXLinkAuthState.UNAUTHORIZED || auth === DXLinkAuthState.AUTHORIZING)

  return (
    <ConsoleConfigProvider value={resolved}>
      <ConnectionProvider value={vm}>
        <Stack spacing={3}>
          <ConnectionPanel />
          {needsAuth && !everAuthorized && <AuthPanel />}
          {everAuthorized && <ChannelsArea key={sessionId} />}
        </Stack>
      </ConnectionProvider>
    </ConsoleConfigProvider>
  )
}
