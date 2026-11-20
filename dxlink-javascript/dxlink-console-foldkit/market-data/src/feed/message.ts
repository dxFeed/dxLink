import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ReportedError } from '@dxfeed/dxlink-console-foldkit-core'

import { FeedEvent, FeedSubscription, FeedView, SubscriptionKind } from './domain'
import { AppliedConfig, ChannelState, DataFormatChoice } from './model'

export const RequestMessage = defineMessageUnion({
  SelectedView: { view: FeedView },
  UpdatedFeed: { value: Schema.String },
  UpdatedSpace: { value: Schema.String },
})
export type RequestMessage = typeof RequestMessage.Type

export const Message = defineMessageUnion({
  SucceededOpenChannel: {
    channelState: ChannelState,
    protocolChannelId: Schema.Finite,
    parameters: Schema.Record(Schema.String, Schema.String),
  },
  FailedOpenChannel: { error: ReportedError },
  SucceededCloseChannel: {},
  FailedCloseChannel: { error: ReportedError },
  ChangedChannelState: { channelState: ChannelState },
  ReportedChannelError: { error: ReportedError },

  SelectedSubscriptionKind: { kind: SubscriptionKind },
  UpdatedSubscriptionType: { value: Schema.String },
  UpdatedSubscriptionSymbol: { value: Schema.String },
  UpdatedSubscriptionSource: { value: Schema.String },
  UpdatedSubscriptionFromTime: { value: Schema.String },
  SubmittedSubscription: {},
  ClickedRemoveSubscription: { key: Schema.String },
  ClickedClearSubscriptions: {},
  SucceededAddSubscription: { subscription: FeedSubscription },
  FailedAddSubscription: { error: ReportedError },
  SucceededRemoveSubscription: { key: Schema.String },
  FailedRemoveSubscription: { error: ReportedError },
  SucceededClearSubscriptions: {},
  FailedClearSubscriptions: { error: ReportedError },

  UpdatedAggregationPeriod: { value: Schema.String },
  SelectedDataFormat: { value: Schema.String },
  UpdatedFieldRowType: { rowId: Schema.Finite, value: Schema.String },
  UpdatedFieldRowFields: { rowId: Schema.Finite, value: Schema.String },
  ClickedRemoveFieldRow: { rowId: Schema.Finite },
  ClickedAddFieldRow: {},
  ClickedApplyConfiguration: {},
  SucceededConfigureFeed: {},
  FailedConfigureFeed: { error: ReportedError },
  ChangedAppliedConfig: { applied: AppliedConfig },

  ReceivedEvents: { events: Schema.Array(FeedEvent) },
  SelectedEventType: { type: Schema.String },
  ClickedTogglePause: {},
  ClickedClearEvents: {},
  ClickedCopyEvents: {},
  SucceededCopyEvents: {},
  FailedCopyEvents: { error: ReportedError },

  UpdatedCandleSymbol: { value: Schema.String },
  UpdatedCandleFromTime: { value: Schema.String },
  SubmittedCandleSubscription: {},
  SucceededSetCandleSubscription: { generation: Schema.Finite },
  FailedSetCandleSubscription: { generation: Schema.Finite, error: ReportedError },
  SucceededMountChart: {},
  FailedMountChart: { reason: Schema.String },
  /** `generation` names the candle subscription the report was produced under. */
  ReceivedCandles: { generation: Schema.Finite, candleCount: Schema.Finite },
  FailedDrawCandles: { generation: Schema.Finite, reason: Schema.String },
})
export type Message = typeof Message.Type

export { DataFormatChoice }
