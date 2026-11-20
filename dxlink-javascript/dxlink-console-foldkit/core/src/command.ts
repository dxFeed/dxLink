import { Effect, Redacted, Schema } from 'effect'
import { Command, Dom } from 'foldkit'

import { DxLinkClient } from './client'
import { reportError } from './error'
import { Message } from './message'

export const channelElementId = (channelId: string): string => `dxlink-channel-${channelId}`

export const ReconnectClient = Command.define('ReconnectClient', {
  messages: [Message.CompletedReconnectClient],
  execute: DxLinkClient.get.pipe(
    Effect.map((client) => {
      client.reconnect()

      return Message.CompletedReconnectClient()
    }),
    Effect.catch(() => Effect.succeed(Message.CompletedReconnectClient()))
  ),
})

export const SetAuthToken = Command.define('SetAuthToken', {
  args: { token: Schema.Redacted(Schema.String) },
  messages: [Message.CompletedSetAuthToken],
  execute: ({ token }) =>
    DxLinkClient.get.pipe(
      Effect.map((client) => {
        client.setAuthToken(Redacted.value(token))

        return Message.CompletedSetAuthToken()
      }),
      Effect.catch(() => Effect.succeed(Message.CompletedSetAuthToken()))
    ),
})

export const ReportAcquireFailure = Command.define('ReportAcquireFailure', {
  args: { reason: Schema.String },
  messages: [Message.CompletedReportAcquireFailure],
  execute: ({ reason }) =>
    reportError({ type: 'CONNECT_FAILED', message: reason }).pipe(
      Effect.map((error) => Message.CompletedReportAcquireFailure({ error }))
    ),
})

export const ScrollToChannel = Command.define('ScrollToChannel', {
  args: { channelId: Schema.String },
  messages: [Message.CompletedScrollToChannel],
  execute: ({ channelId }) =>
    Dom.scrollIntoViewAfterPaint(`#${channelElementId(channelId)}`, {
      block: 'start',
    }).pipe(
      Effect.as(Message.CompletedScrollToChannel()),
      Effect.catch(() => Effect.succeed(Message.CompletedScrollToChannel()))
    ),
})
