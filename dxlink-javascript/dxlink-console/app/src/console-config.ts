import { resolveConsoleConfig } from '@dxfeed/dxlink-console-core'
import type { ConsoleConfig } from '@dxfeed/dxlink-console-core'

import { getDefaultWsUrl } from './connection-url'
import { readInjectedConfig, readSearchConfig } from './console-config-sources'
import type { AppConsoleInput } from './console-config-sources'

/**
 * Everything the page itself can tell us, read once.
 *
 * This is the only module that touches globals or `import.meta.env`. The console packages
 * below take resolved values as data, which is what lets a host with its own answers pass
 * them in and reach for nothing.
 */
export interface AppConsoleSources {
  injected: AppConsoleInput
  search: AppConsoleInput
}

export const readAppConsoleSources = (): AppConsoleSources => ({
  injected: readInjectedConfig(window),
  search: readSearchConfig(window.location.search),
})

/** Descriptor-set settings for the RPC plugin, later source winning, lock respected. */
export interface DescriptorSettings {
  url: string
  locked: boolean
}

/**
 * Resolve the RPC plugin's descriptor-set options.
 *
 * These used to be fields on the core profile. They are the RPC service's own settings, so
 * they are resolved here and handed to `rpcChannelPlugin()` at composition — which is why
 * core no longer has to know that descriptor sets exist. The precedence rules are the
 * profile's: only the injected config can lock, and a locked value ignores the query string.
 */
export const resolveDescriptorSettings = ({
  injected,
  search,
}: AppConsoleSources): DescriptorSettings => {
  const locked = injected.descriptorSetUrlLocked ?? false
  const url = locked
    ? (injected.descriptorSetUrl ?? '')
    : (search.descriptorSetUrl ?? injected.descriptorSetUrl ?? '')

  return { url, locked }
}

/**
 * Resolve the console profile this build starts from.
 *
 * The app layer carries the only build-time choice — a development build points at the
 * shared relay rather than at the page's own origin, which is what `getDefaultWsUrl` has
 * always decided, and which is why core no longer derives a URL at all.
 *
 * `registeredKinds` is what makes the open kind vocabulary safe: a `?channels=` value or an
 * injected `channelKinds` naming something no plugin provides is dropped with a warning here,
 * where the plugin list is known. A list that leaves nothing is ignored altogether, since a
 * console offering no channels is never what anyone meant.
 */
export const resolveAppConsoleConfig = (
  sources: AppConsoleSources,
  registeredKinds: readonly string[]
): ConsoleConfig => {
  const keepKnown = (input: AppConsoleInput): AppConsoleInput => {
    const requested = input.core.channelKinds
    if (requested == null) return input
    const known = requested.filter((kind: string) => registeredKinds.includes(kind))
    const dropped = requested.filter((kind: string) => !registeredKinds.includes(kind))
    if (dropped.length > 0) {
      console.warn(
        `Console configuration: no channel service provides (${dropped.join(', ')}); ignoring.`
      )
    }

    return { ...input, core: { ...input.core, channelKinds: known.length > 0 ? known : undefined } }
  }

  return resolveConsoleConfig({
    app: { wsUrl: getDefaultWsUrl(window.location, import.meta.env.PROD) },
    injected: keepKnown(sources.injected).core,
    search: keepKnown(sources.search).core,
  })
}
