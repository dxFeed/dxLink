import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'
import Stack from '@mui/material/Stack'

import { AuthPanel } from './auth/auth-panel'
import { ChannelsArea } from './channels/channels-area'
import type { ErasedChannelPlugin } from './channels/plugin'
import { ConnectionProvider } from './connection/connection-context'
import { ConnectionPanel } from './connection/connection-panel'
import { ConnectionViewModel } from './connection/connection-view-model'
import type { ConsoleConfig } from './lib/console-config'
import { ConsoleConfigProvider } from './lib/console-config-context'
import { useOwnedViewModel, useVM } from './view-model'

export interface ConsolePageProps {
  /**
   * Initial values for the console's forms; see {@link ConsoleConfig}.
   *
   * Required, like {@link ConsolePageProps.channels}: a profile is a decision about how this
   * console is deployed, and core reads no globals to guess one. `builtinConsoleConfig()` is
   * the do-nothing answer if a host genuinely has no preferences.
   */
  config: ConsoleConfig
  /**
   * The channel services this console offers.
   *
   * Required: which services exist is a composition decision, and a host that leaves the
   * market-data plugins out never imports their code.
   */
  channels: readonly ErasedChannelPlugin[]
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
 * `config` and `channels` are what make the page embeddable, and both are required: the page
 * reads no globals and holds no defaults, so everything about how this console is deployed
 * arrives as props. There is nothing here for a host to override — only to supply.
 */
export const ConsolePage = ({ config, channels }: ConsolePageProps) => {
  const vm = useOwnedViewModel(() => new ConnectionViewModel())
  const connection = useVM(vm, (s) => s.connection)
  const auth = useVM(vm, (s) => s.auth)
  const sessionId = useVM(vm, (s) => s.sessionId)
  const everAuthorized = useVM(vm, (s) => s.everAuthorized)

  const connected = connection === DXLinkConnectionState.CONNECTED
  const needsAuth =
    connected && (auth === DXLinkAuthState.UNAUTHORIZED || auth === DXLinkAuthState.AUTHORIZING)

  return (
    <ConsoleConfigProvider value={config}>
      <ConnectionProvider value={vm}>
        <Stack spacing={3}>
          <ConnectionPanel />
          {needsAuth && !everAuthorized && <AuthPanel />}
          {everAuthorized && <ChannelsArea key={sessionId} channels={channels} />}
        </Stack>
      </ConnectionProvider>
    </ConsoleConfigProvider>
  )
}
