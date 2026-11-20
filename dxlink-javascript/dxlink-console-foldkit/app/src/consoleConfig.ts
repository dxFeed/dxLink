import { Array, Option } from 'effect'

import { type ConsoleConfig, resolveConsoleConfig } from '@dxfeed/dxlink-console-foldkit-core'

import { type LocationLike, getDefaultWsUrl } from './connectionUrl'
import type { AppConsoleInput } from './consoleConfigSources'

/** Everything the page itself can tell the console, already parsed. */
export type AppConsoleSources = Readonly<{
  injected: AppConsoleInput
  search: AppConsoleInput
}>

/** Descriptor-set settings for the RPC plugin. */
export type DescriptorSettings = Readonly<{
  url: string
  isLocked: boolean
}>

/**
 * Resolve the RPC plugin's descriptor-set options.
 *
 * They are the RPC service's own settings, so they are resolved here and handed to
 * `rpcChannelPlugin()` at composition — which is why core does not have to know that
 * descriptor sets exist. The precedence rules are the profile's: only the injected config can
 * lock, and a locked value ignores the query string.
 */
export const resolveDescriptorSettings = ({
  injected,
  search,
}: AppConsoleSources): DescriptorSettings => {
  const isLocked = injected.descriptorSetUrlLocked ?? false

  return {
    isLocked,
    url: isLocked
      ? (injected.descriptorSetUrl ?? '')
      : (search.descriptorSetUrl ?? injected.descriptorSetUrl ?? ''),
  }
}

/**
 * Keep only the channel kinds some registered plugin provides.
 *
 * This is what makes the open kind vocabulary safe: a `?channels=` value or an injected
 * `channelKinds` naming something no plugin provides is dropped with a warning here, where
 * the plugin list is known. A list that leaves nothing is ignored altogether, since a console
 * offering no channels is never what anyone meant.
 */
const keepKnownKinds = (
  input: AppConsoleInput,
  registeredKinds: ReadonlyArray<string>
): AppConsoleInput['core'] =>
  Option.match(Option.fromNullishOr(input.core.channelKinds), {
    onNone: () => input.core,
    onSome: (requested) => {
      const known = Array.filter(requested, (kind) => Array.contains(registeredKinds, kind))
      const dropped = Array.filter(requested, (kind) => !Array.contains(registeredKinds, kind))
      if (Array.isArrayNonEmpty(dropped)) {
        console.warn(
          `Console configuration: no channel service provides (${Array.join(dropped, ', ')}); ignoring.`
        )
      }
      const { channelKinds: _requested, ...rest } = input.core

      return Array.isArrayNonEmpty(known) ? { ...rest, channelKinds: known } : rest
    },
  })

/**
 * Resolve the console profile this build starts from.
 *
 * The app layer carries the only build-time choice: a development build points at the shared
 * relay rather than at the page's own origin.
 */
export const resolveAppConsoleConfig = (
  sources: AppConsoleSources,
  registeredKinds: ReadonlyArray<string>,
  location: LocationLike,
  isProduction: boolean
): ConsoleConfig =>
  resolveConsoleConfig({
    app: { wsUrl: getDefaultWsUrl(location, isProduction) },
    injected: keepKnownKinds(sources.injected, registeredKinds),
    search: keepKnownKinds(sources.search, registeredKinds),
  })
