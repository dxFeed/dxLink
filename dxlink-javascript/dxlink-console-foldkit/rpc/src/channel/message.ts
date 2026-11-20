import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { ReportedError } from '@dxfeed/dxlink-console-foldkit-core'

import { StampedJson } from './model'

export const Message = defineMessageUnion({
  SucceededOpenCall: { sent: StampedJson },
  FailedOpenCall: { error: ReportedError },
  ReceivedResponses: { responses: Schema.Array(StampedJson) },
  EndedCall: {},
  FailedCall: { error: ReportedError },
  UpdatedSendJson: { value: Schema.String },
  SucceededValidateSendRequest: {
    json: Schema.String,
    /** What is wrong with the request, or `None` when it fits the method's input message. */
    maybeError: Schema.Option(Schema.String),
  },
  FailedValidateSendRequest: { json: Schema.String, error: ReportedError },
  ClickedSend: {},
  SucceededSendRequest: { sent: StampedJson },
  FailedSendRequest: { error: ReportedError },
})
export type Message = typeof Message.Type

export const isMessage = Schema.is(Message)
