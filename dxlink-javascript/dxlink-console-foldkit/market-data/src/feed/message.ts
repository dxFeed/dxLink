import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ReportedError } from '@dxfeed/dxlink-console-foldkit-core'

import { FeedEvent, FeedView, SubscriptionKind } from './domain'
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
  CompletedCloseChannel: {},
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
  CompletedAddSubscription: {},
  CompletedRemoveSubscription: {},
  CompletedClearSubscriptions: {},

  UpdatedAggregationPeriod: { value: Schema.String },
  SelectedDataFormat: { value: Schema.String },
  UpdatedFieldRowType: { rowId: Schema.Finite, value: Schema.String },
  UpdatedFieldRowFields: { rowId: Schema.Finite, value: Schema.String },
  ClickedRemoveFieldRow: { rowId: Schema.Finite },
  ClickedAddFieldRow: {},
  ClickedApplyConfiguration: {},
  CompletedConfigureFeed: {},
  ChangedAppliedConfig: { applied: AppliedConfig },

  ReceivedEvents: { events: Schema.Array(FeedEvent) },
  SelectedEventType: { type: Schema.String },
  ClickedTogglePause: {},
  ClickedClearEvents: {},
  ClickedCopyEvents: {},
  CompletedCopyEvents: {},

  UpdatedCandleSymbol: { value: Schema.String },
  UpdatedCandleFromTime: { value: Schema.String },
  SubmittedCandleSubscription: {},
  CompletedSetCandleSubscription: {},
  CompletedMountChart: {},
  ReceivedCandles: { candleCount: Schema.Finite },
  FailedDrawCandles: { reason: Schema.String },
})
export type Message = typeof Message.Type

export { DataFormatChoice }
