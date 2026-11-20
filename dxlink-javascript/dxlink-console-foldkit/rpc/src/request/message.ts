import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Listbox } from '@foldkit/ui'

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
  GotServiceListboxMessage: { message: Listbox.Message },
  GotMethodListboxMessage: { message: Listbox.Message },
  /** From the picker of the enum field of the request with this key. */
  GotEnumListboxMessage: { fieldId: Schema.String, message: Listbox.Message },
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
