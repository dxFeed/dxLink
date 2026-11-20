import { Predicate, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import { ErrorLog } from '@dxfeed/dxlink-console-foldkit-core'
import { RadioGroup, Tabs } from '@foldkit/ui'

import { Feed } from '../domain'

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
  kind: Feed.SubscriptionKind,
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
  rows: Schema.Array(Feed.EventFieldRow),
  nextRowId: Schema.Finite,
})
export type ConfigurationForm = typeof ConfigurationForm.Type

/**
 * The events table. While paused it shows `frozen`, the rows as they were at the moment of
 * pausing, and the feed keeps filling `events` underneath for the moment it resumes.
 */
export const EventsTable = defineTaggedUnion({
  Live: { events: Feed.EventsByType },
  Paused: { frozen: Feed.EventsByType, events: Feed.EventsByType },
})
export type EventsTable = typeof EventsTable.Type

export const SubscriptionsState = Schema.Struct({
  form: SubscriptionForm,
  /** Keyboard-focus state of the control that chooses the form's subscription kind. */
  subscriptionKindRadioGroup: RadioGroup.Model,
  configuration: ConfigurationForm,
  /** The subscriptions the feed accepted, in the order they were added. */
  subscriptions: Schema.Array(Feed.FeedSubscription),
  /** Whether the configuration section is expanded. */
  isConfigurationOpen: Schema.Boolean,
  applied: AppliedConfig,
  table: EventsTable,
  /** The selected event-type tab; `None` follows the first type received. */
  maybeActiveType: Schema.Option(Schema.String),
  /** Keyboard-focus state of the event-type tabs. */
  eventTypeTabs: Tabs.Model,
})
export type SubscriptionsState = typeof SubscriptionsState.Type

/** The control that chooses the kind of subscription the form adds. */
export const SubscriptionKindRadioGroup = RadioGroup.create<Feed.SubscriptionKind>()

/** The tabs of the events table, one per event type that has rows. */
export const EventTypeTabs = Tabs.create<string>()

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
  /** Feed qualification the channel is opened with; empty when the request named none. */
  feed: Schema.String,
  /** Feed space the channel is opened with; empty when the request named none. */
  space: Schema.String,
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
