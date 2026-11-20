import {
  Array,
  Duration,
  Effect,
  Equal,
  Equivalence,
  Exit,
  MutableHashMap,
  Option,
  Queue,
  Schema,
  Scope,
  Stream,
} from 'effect'
import { Subscription } from 'foldkit'

import {
  type DXLinkAuthState,
  type DXLinkClient,
  type DXLinkConnectionDetails,
  DXLinkConnectionState,
  type DXLinkError,
} from '@dxfeed/dxlink-api'

import * as ErasedChannel from './channel/erasedChannel'
import type { RegisteredChannelPlugin } from './channel/plugin'
import { type DxLinkClientService, DxLinkSession } from './client'
import { reportError } from './domain/error'
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

/** One channel whose card is open: what `connect` needs, and the address its Messages carry. */
const OpenChannel = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  model: ErasedChannel.Model,
})
export type OpenChannel = typeof OpenChannel.Type

const openChannelsOf = (model: Model): ReadonlyArray<OpenChannel> =>
  model.session._tag === 'Open'
    ? Array.getSomes(
        Array.map(model.channels, (channel) =>
          channel.card._tag === 'Open'
            ? Option.some({ id: channel.id, kind: channel.kind, model: channel.model })
            : Option.none()
        )
      )
    : []

/** How often the open cards in the Model are compared with the channels that are connected. */
const RECONCILE_INTERVAL = Duration.millis(50)

/**
 * Keep the live channels in step with the Model for as long as one session lasts.
 *
 * Every open card is connected through its plugin in a scope of its own; a card that is closed
 * has its scope closed, and so has every card when the Stream ends with its session. The set of
 * cards changes without restarting the Stream — restarting would reconnect every channel — so
 * the Stream reads the current cards itself, on an interval.
 *
 * A channel is connected with its Model as first seen here. What it reports afterwards reaches
 * that Model as Messages, not through this Stream.
 */
export const streamChannels = <Services>(
  plugins: ReadonlyArray<RegisteredChannelPlugin<Services>>,
  readOpenChannels: () => ReadonlyArray<OpenChannel>
): Stream.Stream<Message, never, Services> =>
  Stream.callback<Message, never, Services>((queue) =>
    Effect.gen(function* () {
      const connected = MutableHashMap.empty<string, Scope.Closeable>()

      yield* Effect.addFinalizer(() =>
        Effect.forEach(MutableHashMap.values(connected), (scope) => Scope.close(scope, Exit.void), {
          discard: true,
        })
      )

      const disconnect = (channelId: string, scope: Scope.Closeable) =>
        Effect.sync(() => MutableHashMap.remove(connected, channelId)).pipe(
          Effect.andThen(Scope.close(scope, Exit.void))
        )

      const connect = (channel: OpenChannel, plugin: RegisteredChannelPlugin<Services>) =>
        Effect.gen(function* () {
          const scope = yield* Scope.make()
          MutableHashMap.set(connected, channel.id, scope)

          yield* Effect.forkIn(
            Scope.provide(
              plugin.connect(channel.model, (message) => {
                Queue.offerUnsafe(
                  queue,
                  Message.GotChannelMessage({ channelId: channel.id, message })
                )
              }),
              scope
            ),
            scope
          )
        })

      const reconcile = Effect.gen(function* () {
        const wanted = readOpenChannels()

        yield* Effect.forEach(
          Array.fromIterable(connected),
          ([channelId, scope]) =>
            Array.some(wanted, (channel) => channel.id === channelId)
              ? Effect.void
              : disconnect(channelId, scope),
          { discard: true }
        )

        yield* Effect.forEach(
          wanted,
          (channel) =>
            MutableHashMap.has(connected, channel.id)
              ? Effect.void
              : Option.match(
                  Array.findFirst(plugins, (plugin) => plugin.kind === channel.kind),
                  { onNone: () => Effect.void, onSome: (plugin) => connect(channel, plugin) }
                ),
          { discard: true }
        )
      })

      return yield* Effect.forever(reconcile.pipe(Effect.andThen(Effect.sleep(RECONCILE_INTERVAL))))
    })
  )

/**
 * Both Streams follow the open session: one listens to the client, the other runs the live
 * channels of the open cards. A new session restarts them; a reconnect does not.
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
      {
        maybeSessionId: Schema.Option(Schema.Finite),
        channels: Schema.Array(OpenChannel),
      },
      {
        modelToDependencies: (model) => ({
          maybeSessionId: maybeOpenSessionId(model),
          channels: openChannelsOf(model),
        }),
        // NOTE: only the session decides the Stream's lifetime. The cards are read live.
        keepAliveEquivalence: Equivalence.make((self, that) =>
          Equal.equals(self.maybeSessionId, that.maybeSessionId)
        ),
        dependenciesToStream: ({ maybeSessionId }, readDependencies) =>
          Option.match(maybeSessionId, {
            onNone: () => Stream.empty,
            onSome: () => streamChannels(plugins, () => readDependencies().channels),
          }),
      }
    ),
  }))
