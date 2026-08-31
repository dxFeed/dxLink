import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'
import ScopedCssBaseline from '@mui/material/ScopedCssBaseline'
import Stack from '@mui/material/Stack'
import { ThemeProvider } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'

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
  /**
   * The theme the console renders with, from `createConsoleTheme()`.
   *
   * Optional, and it is the one prop with two right answers. A host that already has a MUI
   * `ThemeProvider` above this page — the standalone app does — leaves it out, so there is
   * one theme in the tree rather than a second nested inside the first. A host embedding the
   * console in a page that is not MUI's passes one, and the console is then self-contained.
   *
   * Left out with no provider above, MUI falls back to its own default theme: the console
   * still works, but looks like stock MUI rather than the console.
   *
   * Passing one also hands the host sole ownership of light/dark — see the note on the
   * component below.
   */
  theme?: Theme
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
 *
 * **The style boundary is `ScopedCssBaseline`, and it is always on.** MUI's reset comes in two
 * forms: `CssBaseline` writes it to `html` and `body`, and `ScopedCssBaseline` writes the same
 * rules to a wrapping `div`. Only the second can be embedded — the first would repaint the
 * background, colour and font of whatever page the console is dropped into, which for a docs
 * site means restyling the documentation around it. The standalone app keeps its own global
 * `CssBaseline` because an app legitimately owns its page; the extra scoped one inside it is
 * the same rules over the same palette, so it changes nothing there.
 *
 * **A supplied theme owns no mode: the host does.** Left to itself, MUI's `ThemeProvider`
 * resolves light/dark by reading `localStorage`, then writes the resulting class onto
 * `document.documentElement` — so an embedded console would read a mode it never stored and
 * restyle the page around it through the host's own `.dark` rules. Observed: a light OS, a
 * stale `mui-mode` from the standalone app, and a docs page flipped to dark by the console
 * sitting in it. `colorSchemeNode={null}` and `storageManager={null}` remove both halves, and
 * nothing is lost — the theme selects color schemes by class, so whatever the host writes on
 * `<html>` (`next-themes` writes exactly `class="dark"`) still drives the console through CSS
 * alone. This is the same rule as the rest of core, applied to the one API that breaks it by
 * default: the console receives its mode, it does not reach for one.
 */
/**
 * `colorSchemeNode` — the node MUI attaches the color-scheme class to — is typed only for
 * projects that opt into CSS variables with a `CssThemeVariables` module augmentation. Core
 * does not ship one: augmenting a global interface from a library retypes an embedding host's
 * own `createTheme()` results, and because every package here compiles core's source directly
 * it would have to be installed in each of their tsconfigs too. The prop is public and
 * documented, so it is passed through this narrow local type instead of a project-wide change.
 * (`storageManager` needs none of this — it is typed on `ThemeProvider` unconditionally.)
 */
const HOST_OWNS_COLOR_SCHEME = { colorSchemeNode: null } satisfies {
  colorSchemeNode: Element | null
}

export const ConsolePage = ({ config, channels, theme }: ConsolePageProps) => {
  const vm = useOwnedViewModel(() => new ConnectionViewModel())
  const connection = useVM(vm, (s) => s.connection)
  const auth = useVM(vm, (s) => s.auth)
  const sessionId = useVM(vm, (s) => s.sessionId)
  const everAuthorized = useVM(vm, (s) => s.everAuthorized)

  const connected = connection === DXLinkConnectionState.CONNECTED
  const needsAuth =
    connected && (auth === DXLinkAuthState.UNAUTHORIZED || auth === DXLinkAuthState.AUTHORIZING)

  const page = (
    <ScopedCssBaseline>
      <ConsoleConfigProvider value={config}>
        <ConnectionProvider value={vm}>
          <Stack spacing={3}>
            <ConnectionPanel />
            {needsAuth && !everAuthorized && <AuthPanel />}
            {everAuthorized && <ChannelsArea key={sessionId} channels={channels} />}
          </Stack>
        </ConnectionProvider>
      </ConsoleConfigProvider>
    </ScopedCssBaseline>
  )

  return theme === undefined ? (
    page
  ) : (
    <ThemeProvider theme={theme} storageManager={null} {...HOST_OWNS_COLOR_SCHEME}>
      {page}
    </ThemeProvider>
  )
}
