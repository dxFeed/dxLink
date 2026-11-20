/**
 * Public surface of the console core.
 *
 * Three groups: the console a host embeds, the channel-plugin contract, and the host API a
 * plugin builds on. Everything else in this package is internal — if a channel package needs
 * something that is not here, that is a boundary decision, not an import to reach for.
 */
import type { RegisteredChannelPlugin } from './channel/plugin'
import { Message } from './message'
import { Model } from './model'
import { managedResources } from './resource'
import { makeSubscriptions } from './subscription'
import { makeConsole as makeConsoleUpdate } from './update'
import { makeView } from './view/view'

/**
 * Build the console for a set of channel services.
 *
 * The plugin list is an argument, never a default: which services exist is a composition
 * decision, and a host that leaves a channel package out never imports its code. The result
 * is a Submodel — `init` takes the configuration profile, and the host lifts `update`, `view`,
 * `subscriptions` and `managedResources` into its own application.
 */
export const makeConsole = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>
) => {
  const { init, update } = makeConsoleUpdate(plugins)

  return {
    Model,
    Message,
    init,
    update,
    view: makeView(plugins),
    subscriptions: makeSubscriptions(plugins),
    managedResources,
  }
}

export { Model, Message }

// The channel-plugin contract.
export { defineChannelPlugin } from './channel/plugin'
export type {
  ChannelEvent,
  ChannelPlugin,
  ChannelStatus,
  ChannelSummary,
  RegisteredChannelPlugin,
  Tone,
} from './channel/plugin'

// The host API a plugin reaches the connection and its own live channels through.
export { DxLinkClient } from './client'
export type { DxLinkClientService } from './client'
export { describeChannelParameters } from './channel/parameters'
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
  prependError,
  reportError,
} from './error'

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
} from './config'
export type { ConsoleConfigInput, ConsoleConfigSources } from './config'
