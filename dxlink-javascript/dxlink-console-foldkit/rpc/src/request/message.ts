import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Summary } from '../domain'

/** A request text together with the method it was checked against. */
export const checkedRequestFields = {
  registryId: Schema.Finite,
  serviceName: Schema.String,
  methodName: Schema.String,
  json: Schema.String,
}

export const Message = defineMessageUnion({
  UpdatedUrl: { value: Schema.String },
  ClickedLoadUrl: {},
  ClickedLoadFile: {},
  SucceededLoadDescriptors: {
    registryId: Schema.Finite,
    source: Schema.String,
    services: Schema.Array(Summary.ServiceSummary),
  },
  FailedLoadDescriptors: { source: Schema.String, reason: Schema.String },
  CancelledLoadDescriptorFile: {},
  SelectedService: { typeName: Schema.String },
  SelectedMethod: { localName: Schema.String },
  UpdatedRequestJson: { value: Schema.String },
  SucceededValidateRequest: {
    ...checkedRequestFields,
    /** What is wrong with the request, or `None` when it fits the method's input message. */
    maybeError: Schema.Option(Schema.String),
  },
  FailedValidateRequest: { ...checkedRequestFields, reason: Schema.String },
})
export type Message = typeof Message.Type

export const isMessage = Schema.is(Message)
