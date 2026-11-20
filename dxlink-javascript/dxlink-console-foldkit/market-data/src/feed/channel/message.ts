import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ReportedError } from '@dxfeed/dxlink-console-foldkit-core'
import { Combobox, Listbox, RadioGroup, Tabs } from '@foldkit/ui'

import { Feed } from '../domain'
import { AppliedConfig, ChannelState } from './model'

export const Message = defineMessageUnion({
  SucceededOpenChannel: {
    channelState: ChannelState,
    protocolChannelId: Schema.Finite,
    parameters: Schema.Record(Schema.String, Schema.String),
  },
  FailedOpenChannel: { error: ReportedError },
  ChangedChannelState: { channelState: ChannelState },
  ReportedChannelError: { error: ReportedError },

  GotSubscriptionKindRadioGroupMessage: { message: RadioGroup.Message },
  GotSubscriptionTypeComboboxMessage: { message: Combobox.Message },
  UpdatedSubscriptionSymbol: { value: Schema.String },
  GotSubscriptionSourceComboboxMessage: { message: Combobox.Message },
  UpdatedSubscriptionFromTime: { value: Schema.String },
  SubmittedSubscription: {},
  ClickedRemoveSubscription: { key: Schema.String },
  ClickedClearSubscriptions: {},
  SucceededAddSubscription: { subscription: Feed.FeedSubscription },
  FailedAddSubscription: { error: ReportedError },
  SucceededRemoveSubscription: { key: Schema.String },
  FailedRemoveSubscription: { error: ReportedError },
  SucceededClearSubscriptions: {},
  FailedClearSubscriptions: { error: ReportedError },

  ToggledConfiguration: { isOpen: Schema.Boolean },
  UpdatedAggregationPeriod: { value: Schema.String },
  GotDataFormatListboxMessage: { message: Listbox.Message },
  GotFieldRowTypeComboboxMessage: { rowId: Schema.Finite, message: Combobox.Message },
  UpdatedFieldRowFields: { rowId: Schema.Finite, value: Schema.String },
  ClickedRemoveFieldRow: { rowId: Schema.Finite },
  ClickedAddFieldRow: {},
  ClickedApplyConfiguration: {},
  SucceededConfigureFeed: {},
  FailedConfigureFeed: { error: ReportedError },
  ChangedAppliedConfig: { applied: AppliedConfig },

  ReceivedEvents: { events: Schema.Array(Feed.FeedEvent) },
  GotEventTypeTabsMessage: { message: Tabs.Message },
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
