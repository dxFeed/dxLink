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
  maybeAggregationPeriod: Schema.Option(Schema.Finite),
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
  nextRowId: Schema.Finite,
})
export type ConfigurationForm = typeof ConfigurationForm.Type

/**
 * The events table. While paused it shows `frozen`, the rows as they were at the moment of
 * pausing, and the feed keeps filling `events` underneath for the moment it resumes.
 */
export const EventsTable = defineTaggedUnion({
  Live: { events: EventsByType },
  Paused: { frozen: EventsByType, events: EventsByType },
})
export type EventsTable = typeof EventsTable.Type

export const SubscriptionsState = Schema.Struct({
  form: SubscriptionForm,
  configuration: ConfigurationForm,
  /** The subscriptions the feed accepted, in the order they were added. */
  subscriptions: Schema.Array(FeedSubscription),
  applied: AppliedConfig,
  table: EventsTable,
  /** The selected event-type tab; `None` follows the first type received. */
  maybeActiveType: Schema.Option(Schema.String),
})
export type SubscriptionsState = typeof SubscriptionsState.Type

export const CandleSubscription = Schema.Struct({
  symbol: Schema.String,
  fromTime: Schema.Finite,
})
export type CandleSubscription = typeof CandleSubscription.Type

/**
 * The candle subscription the chart is drawing.
 *
 * `generation` is its identity: what the live channel reports is stamped with the generation
 * it was produced under, so a report from an earlier subscription is told apart from one of
 * this subscription even when both name the same symbol.
 */
export const ActiveCandleSubscription = Schema.Struct({
  generation: Schema.Finite,
  subscription: CandleSubscription,
  candleCount: Schema.Finite,
})
export type ActiveCandleSubscription = typeof ActiveCandleSubscription.Type

export const ChartState = Schema.Struct({
  symbol: Schema.String,
  fromTime: Schema.String,
  /** The generation of the latest subscription submitted; `0` before the first. */
  lastGeneration: Schema.Finite,
  maybeActive: Schema.Option(ActiveCandleSubscription),
  maybeChartError: Schema.Option(Schema.String),
})
export type ChartState = typeof ChartState.Type

export const View = defineTaggedUnion({
  Subscriptions: { state: SubscriptionsState },
  Chart: { state: ChartState },
})
export type View = typeof View.Type

/** What identifies an opened channel in the protocol, kept after it is closed. */
export const OpenedChannel = Schema.Struct({
  protocolChannelId: Schema.Finite,
  /** Parameters the channel was actually opened with. */
  parameters: Schema.Record(Schema.String, Schema.String),
})
export type OpenedChannel = typeof OpenedChannel.Type

/**
 * Whether the server has an opened channel ready. A channel is requested again by its client
 * after a reconnect, so an opened channel moves between the two.
 */
export const ChannelLink = Schema.Literals(['Requested', 'Ready'])
export type ChannelLink = typeof ChannelLink.Type

/**
 * Where a channel is in its life.
 *
 * Only `Opened` has a live feed behind it, so only `Opened` accepts input; `FailedToOpen`
 * and `Closed` are terminal. A channel closed before it was opened has no protocol identity.
 */
export const Lifecycle = defineTaggedUnion({
  Opening: {},
  Opened: { channel: OpenedChannel, link: ChannelLink },
  FailedToOpen: {},
  Closed: { maybeChannel: Schema.Option(OpenedChannel) },
})
export type Lifecycle = typeof Lifecycle.Type

const CHANNEL_KIND = 'FeedChannel'

export const Model = Schema.Struct({
  kind: Schema.Literal(CHANNEL_KIND),
  /** The id of the channel's card — the address of its live feed and of its Messages. */
  channelId: Schema.String,
  lifecycle: Lifecycle,
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
