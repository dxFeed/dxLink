import { Predicate, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import { ErrorLog } from '@dxfeed/dxlink-console-foldkit-core'

import { EventFieldRow, EventsByType, FeedSubscription, FeedView, SubscriptionKind } from './domain'

// REQUEST

const REQUEST_KIND = 'FeedRequest'

/**
 * FEED channel-request parameters — the values entered in the request form. Kept between
 * dialog opens so several channels of the same kind are quick to open.
 */
export const Request = Schema.Struct({
  kind: Schema.Literal(REQUEST_KIND),
  view: FeedView,
  feed: Schema.String,
  space: Schema.String,
})
export type Request = typeof Request.Type

export const initialRequest = (): Request => ({
  kind: REQUEST_KIND,
  view: 'Subscriptions',
  feed: '',
  space: '',
})

// CHANNEL

export const ChannelState = Schema.Enum(DXLinkChannelState)

/** The configuration the server reports back, which may differ from the one requested. */
export const AppliedConfig = Schema.Struct({
  /** `None` while the server has not defined one. */
  maybeAggregationPeriod: Schema.Option(Schema.Number),
  dataFormat: Schema.String,
  /** Negotiated field order per event type. */
  eventFields: Schema.Record(Schema.String, Schema.Array(Schema.String)),
})
export type AppliedConfig = typeof AppliedConfig.Type

/** The subscription form, as typed. */
export const SubscriptionForm = Schema.Struct({
  kind: SubscriptionKind,
  type: Schema.String,
  symbol: Schema.String,
  source: Schema.String,
  fromTime: Schema.String,
})
export type SubscriptionForm = typeof SubscriptionForm.Type

export const DataFormatChoice = Schema.Literals(['', 'FULL', 'COMPACT'])
export type DataFormatChoice = typeof DataFormatChoice.Type

/** The requested configuration, as typed. Empty values mean "server default". */
export const ConfigurationForm = Schema.Struct({
  aggregationPeriod: Schema.String,
  dataFormat: DataFormatChoice,
  rows: Schema.Array(EventFieldRow),
  nextRowId: Schema.Number,
})
export type ConfigurationForm = typeof ConfigurationForm.Type

export const SubscriptionsState = Schema.Struct({
  form: SubscriptionForm,
  configuration: ConfigurationForm,
  subscriptions: Schema.Array(FeedSubscription),
  applied: AppliedConfig,
  events: EventsByType,
  /**
   * The events shown while the table is paused: a copy taken at the moment of pausing, so
   * the feed keeps filling `events` underneath.
   */
  maybeFrozenEvents: Schema.Option(EventsByType),
  /** The selected event-type tab; `None` follows the first type received. */
  maybeActiveType: Schema.Option(Schema.String),
})
export type SubscriptionsState = typeof SubscriptionsState.Type

export const CandleSubscription = Schema.Struct({
  symbol: Schema.String,
  fromTime: Schema.Number,
})
export type CandleSubscription = typeof CandleSubscription.Type

export const ChartState = Schema.Struct({
  symbol: Schema.String,
  fromTime: Schema.String,
  maybeSubscription: Schema.Option(CandleSubscription),
  candleCount: Schema.Number,
  maybeChartError: Schema.Option(Schema.String),
})
export type ChartState = typeof ChartState.Type

export const View = defineTaggedUnion({
  Subscriptions: { state: SubscriptionsState },
  Chart: { state: ChartState },
})
export type View = typeof View.Type

const CHANNEL_KIND = 'FeedChannel'

export const Model = Schema.Struct({
  kind: Schema.Literal(CHANNEL_KIND),
  /** The id of the channel's card — the address of its live feed and of its Messages. */
  channelId: Schema.String,
  channelState: ChannelState,
  /** Protocol channel id; `None` until the channel is opened. */
  maybeProtocolChannelId: Schema.Option(Schema.Number),
  /** Parameters the channel was actually opened with. */
  parameters: Schema.Record(Schema.String, Schema.String),
  errorLog: ErrorLog,
  view: View,
})
export type Model = typeof Model.Type

export const CHANNEL_MODEL_KIND = CHANNEL_KIND

/**
 * Whether a value is a FEED channel Model.
 *
 * Checks the `kind` brand only: a Model holds every received event, and this runs for each
 * Message, so validating the whole structure would cost more than the update itself. Nothing
 * but this plugin writes the brand.
 */
export const isModel = (value: unknown): value is Model =>
  Predicate.hasProperty(value, 'kind') && value.kind === CHANNEL_KIND
