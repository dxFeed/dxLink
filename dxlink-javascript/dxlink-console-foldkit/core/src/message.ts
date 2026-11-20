import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

import { Dialog } from '@foldkit/ui'

import * as ErasedChannel from './channel/erasedChannel'
import * as ErasedRequest from './channel/erasedRequest'
import { ReportedError } from './error'
import { AuthState, ClientStatus, ConnectionField } from './model'

export const Message = defineMessageUnion({
  UpdatedConnectionField: { field: ConnectionField, value: Schema.String },
  ClickedConnect: {},
  ClickedReconnect: {},
  ClickedDisconnect: {},
  AcquiredClient: { sessionId: Schema.Finite },
  ReleasedClient: {},
  FailedAcquireClient: { reason: Schema.String },
  CompletedStampAcquireFailure: { error: ReportedError },
  ChangedClientStatus: { status: ClientStatus },
  ChangedAuthState: { auth: AuthState },
  ReportedConnectionError: { error: ReportedError },
  ClickedClearConnectionErrors: {},
  SucceededReconnectClient: {},
  FailedReconnectClient: { error: ReportedError },
  UpdatedAuthToken: { value: Schema.Redacted(Schema.String) },
  SubmittedAuthToken: {},
  SucceededSetAuthToken: {},
  FailedSetAuthToken: { error: ReportedError },
  ClickedAddChannel: { kind: Schema.String },
  GotRequestDialogMessage: { message: Dialog.Message },
  GotRequestMessage: { pluginId: Schema.String, message: ErasedRequest.Message },
  ClickedOpenChannel: {},
  GotChannelMessage: {
    channelId: Schema.String,
    message: ErasedChannel.Message,
  },
  ClickedToggleChannel: { channelId: Schema.String },
  ClickedCloseChannel: { channelId: Schema.String },
  ClickedClearChannelErrors: { channelId: Schema.String },
  CompletedScrollToChannel: {},
})
export type Message = typeof Message.Type
