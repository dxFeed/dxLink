import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { Suspense, lazy } from 'react'
import type { ReactElement } from 'react'

import type { ErasedChannelPlugin } from '../features/channels/plugin'
import { ConsolePage } from '../pages/console-page'
import { ErrorBoundary } from '../shared/components/error-boundary'
import type { ConsoleConfig } from '../shared/lib/console-config'

// The AsyncAPI viewer bundles its own parser and syntax highlighter and is far larger
// than the rest of the app, so it is kept out of the initial chunk.
const ProtocolPage = lazy(() => import('../pages/protocol-page'))

const RouteFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
    <CircularProgress />
  </Box>
)

export interface RouteDef {
  /** Tab label shown in the app bar. */
  label: string
  /** Route path (hash-routed). */
  path: string
  /** Page element rendered for the route. */
  element: ReactElement
}

/**
 * Single source of truth for navigation: drives both the tab bar and the router,
 * so the two can never drift apart.
 *
 * A function rather than a constant because the console page takes the resolved
 * configuration profile and the channel services on offer — the standalone app resolves
 * both once at startup and hands them in here, which is the same thing an embedding host
 * does by passing props.
 */
export const createRoutes = (
  config: ConsoleConfig,
  channels: readonly ErasedChannelPlugin[]
): readonly RouteDef[] => [
  { label: 'Console', path: '/', element: <ConsolePage config={config} channels={channels} /> },
  {
    label: 'Protocol',
    path: '/protocol',
    // A rejected chunk fetch (stale deploy, flaky network) throws during render, which
    // would otherwise reach the root and unmount the whole app — including the console
    // page and every open channel.
    element: (
      <ErrorBoundary title="The protocol page failed to load">
        <Suspense fallback={<RouteFallback />}>
          <ProtocolPage />
        </Suspense>
      </ErrorBoundary>
    ),
  },
]
