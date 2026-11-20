import { Effect, Redacted, Schema } from 'effect'
import { Command, Dom } from 'foldkit'

import { DxLinkClient } from './client'
import { reportError } from './error'
import { Message } from './message'

export const channelElementId = (channelId: string): string => `dxlink-channel-${channelId}`

const describeFailure = (cause: unknown): string =>
  cause instanceof Error ? cause.message : globalThis.String(cause)

/** A failure of the console itself rather than of the protocol, stamped for the error log. */
const reportConsoleFailure = (cause: unknown) =>
  reportError({ type: 'CONSOLE', message: describeFailure(cause) })

const NO_SESSION = 'No connection is open.'

export const ReconnectClient = Command.define('ReconnectClient', {
  messages: [Message.SucceededReconnectClient, Message.FailedReconnectClient],
  execute: DxLinkClient.get.pipe(
    Effect.mapError(() => NO_SESSION),
    Effect.flatMap((client) => Effect.try(() => client.reconnect())),
    Effect.as(Message.SucceededReconnectClient()),
    Effect.catch((cause) =>
      Effect.map(reportConsoleFailure(cause), (error) => Message.FailedReconnectClient({ error }))
    )
  ),
})

export const SetAuthToken = Command.define('SetAuthToken', {
  args: { token: Schema.Redacted(Schema.String) },
  messages: [Message.SucceededSetAuthToken, Message.FailedSetAuthToken],
  execute: ({ token }) =>
    DxLinkClient.get.pipe(
      Effect.mapError(() => NO_SESSION),
      Effect.flatMap((client) => Effect.try(() => client.setAuthToken(Redacted.value(token)))),
      Effect.as(Message.SucceededSetAuthToken()),
      Effect.catch((cause) =>
        Effect.map(reportConsoleFailure(cause), (error) => Message.FailedSetAuthToken({ error }))
      )
    ),
})

/** Read the clock for a client that could not be built, so the failure can be logged. */
export const StampAcquireFailure = Command.define('StampAcquireFailure', {
  args: { reason: Schema.String },
  messages: [Message.CompletedStampAcquireFailure],
  execute: ({ reason }) =>
    reportError({ type: 'CONNECT_FAILED', message: reason }).pipe(
      Effect.map((error) => Message.CompletedStampAcquireFailure({ error }))
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
      Effect.orElseSucceed(() => Message.CompletedScrollToChannel())
    ),
})
