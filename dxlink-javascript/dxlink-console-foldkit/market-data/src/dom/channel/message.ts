import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ReportedError } from '@dxfeed/dxlink-console-foldkit-core'

import { Book, Config } from '../domain'
import { ChannelState } from './model'

export const Message = defineMessageUnion({
  SucceededOpenDomChannel: {
    protocolChannelId: Schema.Finite,
    parameters: Schema.Record(Schema.String, Schema.String),
    channelState: ChannelState,
    applied: Config.AppliedConfig,
  },
  FailedOpenDomChannel: { error: ReportedError },
  ReceivedSnapshot: { snapshot: Book.DomSnapshot },
  ChangedChannelState: { channelState: ChannelState },
  ChangedAppliedConfig: { applied: Config.AppliedConfig },
  ReportedChannelError: { error: ReportedError },
  ToggledConfiguration: { isOpen: Schema.Boolean },
  UpdatedAcceptAggregationPeriod: { value: Schema.String },
  UpdatedAcceptDepthLimit: { value: Schema.String },
  UpdatedAcceptOrderFields: { value: Schema.String },
  ClickedApplyConfiguration: {},
  SucceededConfigureDomChannel: {},
  FailedConfigureDomChannel: { error: ReportedError },
})
export type Message = typeof Message.Type
