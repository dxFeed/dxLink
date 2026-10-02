/**
 * Public surface of the console core.
 *
 * Three groups: the page a host embeds, the channel-plugin contract, and the host API a
 * plugin uses (`useConnection` + the model primitives its channel model is built from).
 * Everything else in this package is internal — if a channel package needs something that is
 * not here, that is a boundary decision, not an import to reach for.
 */

// The page a host embeds, the theme it renders with, and the area it composes.
export { ConsolePage } from './console-page'
export { createConsoleTheme } from './theme'
export type { ConsolePageProps } from './console-page'
export { ChannelsArea } from './channels/channels-area'
export type { ChannelsAreaProps } from './channels/channels-area'

// The channel-plugin contract.
export { defineChannelPlugin } from './channels/plugin'
export type { ChannelPlugin, ErasedChannelPlugin } from './channels/plugin'
export type { DraftChannel } from './channels/types'
export { ChannelWidget } from './channels/channel-widget'

// The host API a plugin reaches the connection through.
export {
  ConnectionProvider,
  useConnection,
  useConnectionClient,
} from './connection/connection-context'
export { makeConnectionModel } from './connection/connection-model'
export type {
  ConnectionModel,
  ConnectionParams,
  ConnectRequest,
} from './connection/connection-model'

// What a channel model is built from: a session holding its dxLink object, listeners scoped to
// that session, commands, and the atoms every channel card shows.
export { FLUSH_INTERVAL, command, listen, on, session, useSession } from './lib/model'
export type { ListenerArgs, ListenerName, Session } from './lib/model'
export { channelStateAtoms, makeChannelAtoms, trackChannel, useChannelCard } from './lib/channel'
export type { ChannelAtoms } from './lib/channel'

// Shared UI and error records.
export { ErrorBoundary } from './components/error-boundary'
export { MAX_ERRORS, prependError } from './lib/timestamped-error'
export type { TimestampedError } from './lib/timestamped-error'

// The configuration profile. Sources arrive already parsed — reading an injected global or a
// query string belongs to whoever owns the page, not here.
export {
  builtinConsoleConfig,
  isConsoleConfigLock,
  resolveConsoleConfig,
} from './lib/console-config'
export type {
  ConsoleConfig,
  ConsoleConfigInput,
  ConsoleConfigLock,
  ConsoleConfigSources,
  KeepaliveConfig,
} from './lib/console-config'
export { ConsoleConfigProvider, useConsoleConfig } from './lib/console-config-context'
