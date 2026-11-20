import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ReportedError } from '@dxfeed/dxlink-console-foldkit-core'

import { AppliedConfig, ChannelState, DomSnapshot } from './handles'

export const Message = defineMessageUnion({
  SucceededOpenDomChannel: {
    protocolChannelId: Schema.Finite,
    parameters: Schema.Record(Schema.String, Schema.String),
    channelState: ChannelState,
    applied: AppliedConfig,
  },
  FailedOpenDomChannel: { error: ReportedError },
  ReceivedSnapshot: { snapshot: DomSnapshot },
  ChangedChannelState: { channelState: ChannelState },
  ChangedAppliedConfig: { applied: AppliedConfig },
  ReportedChannelError: { error: ReportedError },
  UpdatedAcceptAggregationPeriod: { value: Schema.String },
  UpdatedAcceptDepthLimit: { value: Schema.String },
  UpdatedAcceptOrderFields: { value: Schema.String },
  ClickedApplyConfiguration: {},
  SucceededConfigureDomChannel: {},
  FailedConfigureDomChannel: { error: ReportedError },
  SucceededCloseDomChannel: {},
  FailedCloseDomChannel: { error: ReportedError },
})
export type Message = typeof Message.Type
