import { Array, Effect, Option, Queue, Schema, Stream } from 'effect'
import { Subscription } from 'foldkit'

import {
  type DXLinkAuthState,
  type DXLinkClient,
  type DXLinkConnectionDetails,
  DXLinkConnectionState,
  type DXLinkError,
} from '@dxfeed/dxlink-api'

import type { RegisteredChannelPlugin } from './channel/plugin'
import { type DxLinkClientService, DxLinkSession } from './client'
import { reportError } from './error'
import { Message } from './message'
import type { ClientStatus, ConnectionDetails, Model } from './model'

const toConnectionDetails = (details: DXLinkConnectionDetails): ConnectionDetails => ({
  clientVersion: details.clientVersion,
  maybeServerVersion: Option.fromNullishOr(details.serverVersion),
  maybeServerKeepaliveTimeout: Option.fromNullishOr(details.serverKeepaliveTimeout),
})

/**
 * Read the status straight off the client.
 *
 * Auth is only meaningful once connected, and details only while a connection exists, so
 * both are dropped rather than reported stale.
 */
const readClientStatus = (client: DXLinkClient): ClientStatus => {
  const connection = client.getConnectionState()

  return {
    connection,
    maybeAuth:
      connection === DXLinkConnectionState.CONNECTED
        ? Option.some(client.getAuthState())
        : Option.none(),
    maybeDetails:
      connection === DXLinkConnectionState.NOT_CONNECTED
        ? Option.none()
        : Option.some(toConnectionDetails(client.getConnectionDetails())),
  }
}

type ClientMessage =
  | typeof Message.ChangedClientStatus.Type
  | typeof Message.ChangedAuthState.Type
  | typeof Message.ReportedConnectionError.Type

/**
 * Everything the client reports, starting with its status at the moment of listening — the
 * client was already connecting by then, so a transition may have been missed.
 */
const streamClient = (client: DXLinkClient): Stream.Stream<ClientMessage> =>
  Stream.callback<ClientMessage | DXLinkError>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const handleConnectionState = () => {
          Queue.offerUnsafe(
            queue,
            Message.ChangedClientStatus({ status: readClientStatus(client) })
          )
        }
        const handleAuthState = (auth: DXLinkAuthState) => {
          Queue.offerUnsafe(queue, Message.ChangedAuthState({ auth }))
        }
        const handleError = (error: DXLinkError) => {
          Queue.offerUnsafe(queue, error)
        }

        client.addConnectionStateChangeListener(handleConnectionState)
        client.addAuthStateChangeListener(handleAuthState)
        client.addErrorListener(handleError)
        handleConnectionState()

        return { handleConnectionState, handleAuthState, handleError }
      }),
      ({ handleConnectionState, handleAuthState, handleError }) =>
        Effect.sync(() => {
          client.removeConnectionStateChangeListener(handleConnectionState)
          client.removeAuthStateChangeListener(handleAuthState)
          client.removeErrorListener(handleError)
        })
    ).pipe(Effect.flatMap(() => Effect.never))
  ).pipe(
    Stream.mapEffect((event) =>
      '_tag' in event
        ? Effect.succeed(event)
        : Effect.map(reportError(event), (error) => Message.ReportedConnectionError({ error }))
    )
  )

/**
 * What the Model's session hears when its client is not there to listen to: one error, so a
 * session that will never report anything says so instead of staying silent.
 */
const streamMissingClient: Stream.Stream<ClientMessage> = Stream.fromEffect(
  Effect.map(
    reportError({
      type: 'CONSOLE',
      message: 'The client of this session is not available; connect again.',
    }),
    (error) => Message.ReportedConnectionError({ error })
  )
)

const maybeOpenSessionId = (model: Model): Option.Option<number> =>
  model.session._tag === 'Open' ? Option.some(model.session.sessionId) : Option.none()

/**
 * Both Streams follow the open session: one listens to the client, the other carries what the
 * plugins' live channels produce. A new session restarts them; a reconnect does not.
 */
export const makeSubscriptions = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>
) =>
  Subscription.make<Model, Message, Services | DxLinkClientService>()((entry) => ({
    client: entry(
      { maybeSessionId: Schema.Option(Schema.Finite) },
      {
        modelToDependencies: (model) => ({
          maybeSessionId: maybeOpenSessionId(model),
        }),
        dependenciesToStream: ({ maybeSessionId }) =>
          Option.match(maybeSessionId, {
            onNone: () => Stream.empty,
            onSome: (sessionId) =>
              Stream.unwrap(
                DxLinkSession.get.pipe(
                  Effect.filterOrFail(
                    (session) => session.sessionId === sessionId,
                    () => 'another session'
                  ),
                  Effect.map(({ client }) => streamClient(client)),
                  Effect.orElseSucceed(() => streamMissingClient)
                )
              ),
          }),
      }
    ),
    channels: entry(
      { maybeSessionId: Schema.Option(Schema.Finite) },
      {
        modelToDependencies: (model) => ({
          maybeSessionId: maybeOpenSessionId(model),
        }),
        dependenciesToStream: ({ maybeSessionId }) =>
          Option.match(maybeSessionId, {
            onNone: () => Stream.empty,
            onSome: () =>
              Stream.mergeAll(
                Array.map(plugins, (plugin) => plugin.events),
                { concurrency: 'unbounded' }
              ).pipe(
                Stream.map(({ channelId, message }) =>
                  Message.GotChannelMessage({ channelId, message })
                )
              ),
          }),
      }
    ),
  }))
