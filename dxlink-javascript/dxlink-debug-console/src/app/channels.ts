import type { ErasedChannelPlugin } from '../features/channels/plugin'
import { domChannelPlugin } from '../features/dom/plugin'
import { feedChannelPlugin } from '../features/feed/plugin'
import { indiChartChannelPlugin } from '../features/indichart/plugin'
import { rpcChannelPlugin } from '../features/rpc/plugin'
import type { ConsoleConfig } from '../shared/lib/console-config'

/**
 * The channel services the debug console offers.
 *
 * This is the composition site, and the only place that names all four. A console that
 * should not offer market data leaves those three out and never imports their code — which
 * is the whole point of the registry, and the reason the channels area takes its plugins as
 * a prop rather than reaching for them.
 *
 * The order here is the order the add-buttons appear in.
 */
export const createAppChannels = (config: ConsoleConfig): readonly ErasedChannelPlugin[] => [
  feedChannelPlugin,
  domChannelPlugin,
  indiChartChannelPlugin,
  rpcChannelPlugin({ descriptorSetUrl: config.descriptorSetUrl }),
]
