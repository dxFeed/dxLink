import { Layer } from 'effect'

import type { RegisteredChannelPlugin } from '@dxfeed/dxlink-console-foldkit-core'
import {
  type DomServices,
  type FeedServices,
  domChannelPlugin,
  feedChannelPlugin,
  marketDataLayer,
} from '@dxfeed/dxlink-console-foldkit-market-data'
import { type RpcServices, rpcChannelPlugin, rpcLayer } from '@dxfeed/dxlink-console-foldkit-rpc'

import type { DescriptorSettings } from './consoleConfig'

/** Everything the registered plugins' Commands and event Streams require. */
export type ChannelServices = FeedServices | DomServices | RpcServices

/**
 * The channel services the debug console offers.
 *
 * This is the composition site, and the only place that names them all. A console that should
 * not offer market data leaves those plugins out and never imports their code — which is the
 * whole point of the registry, and the reason the console takes its plugins as an argument
 * rather than reaching for them.
 *
 * The order here is the order the add-buttons appear in.
 */
export const createAppChannels = (
  descriptors: DescriptorSettings
): ReadonlyArray<RegisteredChannelPlugin<ChannelServices>> => [
  feedChannelPlugin,
  domChannelPlugin,
  rpcChannelPlugin({ descriptorSetUrl: descriptors.url, locked: descriptors.isLocked }),
]

/** The app-lifetime services the registered plugins keep their live channels in. */
export const channelsLayer = Layer.mergeAll(marketDataLayer, rpcLayer)
