import { Option, Schema } from 'effect'

import type { DepthOfMarketConfig } from '@dxfeed/dxlink-api'

/** What a DOM channel is opened with. */
export const DomConfig = Schema.Struct({
  symbol: Schema.String,
  /** Price-level sources as typed: a comma- or space-separated list. */
  source: Schema.String,
  /** Feed qualification — left out of the protocol request when empty. */
  feed: Schema.String,
  /** Feed space — left out of the protocol request when empty. */
  space: Schema.String,
})
export type DomConfig = typeof DomConfig.Type

/**
 * The configuration the server applied. The two numbers are absent until the server has
 * answered — before that the client holds no value for them.
 */
export const AppliedConfig = Schema.Struct({
  maybeAggregationPeriod: Schema.Option(Schema.Finite),
  maybeDepthLimit: Schema.Option(Schema.Finite),
  dataFormat: Schema.String,
  orderFields: Schema.Array(Schema.String),
})
export type AppliedConfig = typeof AppliedConfig.Type

/** NaN is how the client says "the server has not told me yet". */
const toMaybeNumber = (value: number): Option.Option<number> =>
  Option.liftPredicate(value, Number.isFinite)

export const toAppliedConfig = (config: DepthOfMarketConfig): AppliedConfig => ({
  maybeAggregationPeriod: toMaybeNumber(config.aggregationPeriod),
  maybeDepthLimit: toMaybeNumber(config.depthLimit),
  dataFormat: config.dataFormat,
  orderFields: config.orderFields,
})
