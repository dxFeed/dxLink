import type { ErasedChannelPlugin } from '@dxfeed/dxlink-console-core'
import { domChannelPlugin } from '@dxfeed/dxlink-console-market-data/dom'
import { feedChannelPlugin } from '@dxfeed/dxlink-console-market-data/feed'
import { indiChartChannelPlugin } from '@dxfeed/dxlink-console-market-data/indichart'
import { rpcChannelPlugin } from '@dxfeed/dxlink-console-rpc'

import type { DescriptorSettings } from './console-config'

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
export const createAppChannels = (
  descriptors: DescriptorSettings
): readonly ErasedChannelPlugin[] => [
  feedChannelPlugin,
  domChannelPlugin,
  indiChartChannelPlugin,
  rpcChannelPlugin({ descriptorSetUrl: descriptors.url, locked: descriptors.locked }),
]
