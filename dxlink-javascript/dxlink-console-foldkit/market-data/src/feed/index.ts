/**
 * The FEED channel service: subscriptions with a live events table, and a candle chart.
 *
 * A host registers `feedChannelPlugin` and puts `feedLayer` into the runtime's `resources`;
 * the layer holds the handles of the connected feeds, which the plugin's Commands act on.
 */
export { feedChannelPlugin } from './plugin'
export { feedLayer } from './live/service'
export type { FeedServices } from './live/service'
export type { FeedConfig, FeedView } from './domain/feed'
