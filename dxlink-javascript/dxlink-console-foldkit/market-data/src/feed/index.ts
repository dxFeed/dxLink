/**
 * The FEED channel service: subscriptions with a live events table, and a candle chart.
 *
 * A host registers `feedChannelPlugin` and puts `feedLayer` into the runtime's `resources`;
 * the layer holds the live feeds the plugin's Commands and event Stream share.
 */
export { feedChannelPlugin } from './plugin'
export { feedLayer } from './live'
export type { FeedServices } from './live'
export type { FeedConfig, FeedView } from './domain'
