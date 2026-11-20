/**
 * Public surface of the console core.
 *
 * Three groups: the console a host embeds, the channel-plugin contract, and the host API a
 * plugin builds on. Everything else in this package is internal — if a channel package needs
 * something that is not here, that is a boundary decision, not an import to reach for.
 */
export { makeConsole } from './console'
export { Message } from './message'
export { Model } from './model'

// The channel-plugin contract.
export { defineChannelPlugin } from './channel/plugin'
export type {
  ChannelConnect,
  ChannelPlugin,
  ChannelStatus,
  ChannelSummary,
  RegisteredChannelPlugin,
  Tone,
} from './channel/plugin'

// The host API a plugin reaches the connection and its own live channels through.
export { DxLinkClient } from './client'
export type { DxLinkClientService } from './client'
export { describeChannelParameters } from './domain/parameters'
export { makeChannelHandles } from './channel/handles'
export type { ChannelHandles } from './channel/handles'

// The errors of one scope, as every channel keeps them.
export {
  ErrorLog,
  MAX_ERRORS,
  ReportedError,
  TimestampedError,
  clearErrors,
  emptyErrorLog,
  formatLocalTime,
  prependError,
  reportError,
} from './domain/error'

// The console's look, shared so a channel reads as part of the same surface.
export * as Kit from './kit'

// The configuration profile. Sources arrive already parsed — reading an injected global or a
// query string belongs to whoever owns the page, not here.
export {
  ConsoleConfig,
  ConsoleConfigLock,
  KeepaliveConfig,
  builtinConsoleConfig,
  isConsoleConfigLock,
  resolveConsoleConfig,
} from './domain/config'
export type { ConsoleConfigInput, ConsoleConfigSources } from './domain/config'
