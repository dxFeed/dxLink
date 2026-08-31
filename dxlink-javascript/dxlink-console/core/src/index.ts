/**
 * Public surface of the console core.
 *
 * Three groups: the page a host embeds, the channel-plugin contract, and the host API a
 * plugin uses (`useConnectionVM` + the view-model hooks). Everything else in this package is
 * internal — if a channel package needs something that is not here, that is a boundary
 * decision, not an import to reach for.
 */

// The page a host embeds, and the area it composes.
export { ConsolePage } from './console-page'
export type { ConsolePageProps } from './console-page'
export { ChannelsArea } from './channels/channels-area'
export type { ChannelsAreaProps } from './channels/channels-area'

// The channel-plugin contract.
export { defineChannelPlugin } from './channels/plugin'
export type { ChannelPlugin, ErasedChannelPlugin } from './channels/plugin'
export type { DraftChannel } from './channels/types'
export { ChannelWidget } from './channels/channel-widget'

// The host API a plugin reaches the connection through.
export { ConnectionProvider, useConnectionVM } from './connection/connection-context'
export { ConnectionViewModel } from './connection/connection-view-model'
export { useOwnedViewModel, useVM, createViewModelContext } from './view-model'
export type { ViewModel } from './view-model'

// Shared UI and the channel-error plumbing every channel view model builds on.
export { ErrorBoundary } from './components/error-boundary'
export { MAX_ERRORS, prependError } from './lib/timestamped-error'
export type { TimestampedError } from './lib/timestamped-error'
export { ChannelErrorTracker, initialChannelErrorState } from './lib/channel-errors'
export type { ChannelErrorState } from './lib/channel-errors'

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
