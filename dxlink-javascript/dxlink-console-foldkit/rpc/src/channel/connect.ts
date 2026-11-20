import {
  Array,
  Clock,
  Duration,
  Effect,
  Option,
  Queue,
  Schema,
  type Scope,
  Stream,
  pipe,
} from 'effect'

import type { DescMethod, DescService, Message as ProtobufMessage } from '@bufbuild/protobuf'
import {
  type ChannelConnect,
  DxLinkClient,
  formatLocalTime,
  reportError,
} from '@dxfeed/dxlink-console-foldkit-core'

import {
  type CallEvent,
  type CallFailure,
  describeCallFailure,
  formatWireJson,
  startCall,
  unknownFailure,
} from '../call'
import { Descriptors } from '../domain'
import {
  type CallHandle,
  RpcHandles,
  type RpcRegistry,
  type RpcServices,
  resolveMethod,
} from '../service'
import { Message } from './message'
import { type Model, stampJson } from './model'

const EVENT_WINDOW = Duration.millis(100)
const EVENT_WINDOW_SIZE = 512

const isReceivedResponses = Schema.is(Message.ReceivedResponses)

/**
 * Turn what a live call reported within one window into Messages, in order. Consecutive
 * responses become one Message, so a fast stream costs one update per window rather than one
 * per response.
 */
export const toMessages = (
  events: ReadonlyArray<CallEvent>,
  time: string
): ReadonlyArray<Message> =>
  Array.reduce(events, Array.empty<Message>(), (messages, event) => {
    if (event._tag === 'Ended') {
      return Array.append(messages, Message.EndedCall())
    }
    if (event._tag === 'Failed') {
      return Array.append(
        messages,
        Message.FailedCall({ error: { type: event.type, message: event.message, time } })
      )
    }
    const response = { time, json: event.json }

    return pipe(
      Array.last(messages),
      Option.filter(isReceivedResponses),
      Option.match({
        onNone: () => Array.append(messages, Message.ReceivedResponses({ responses: [response] })),
        onSome: (last) =>
          Array.append(
            Array.dropRight(messages, 1),
            Message.ReceivedResponses({ responses: Array.append(last.responses, response) })
          ),
      })
    )
  })

/**
 * Emit what the call reports, one window at a time, each window stamped with the local time
 * it is emitted at. Runs until the queue is shut down.
 */
const forwardEvents = (
  events: Queue.Dequeue<CallEvent>,
  emit: (message: Message) => void
): Effect.Effect<void> =>
  Stream.fromQueue(events).pipe(
    Stream.groupedWithin(EVENT_WINDOW_SIZE, EVENT_WINDOW),
    Stream.runForEach((window) =>
      Effect.map(Clock.currentTimeMillis, (millis) => {
        Array.forEach(toMessages(window, formatLocalTime(millis)), emit)
      })
    )
  )

/**
 * How a call reaches the wire: the connection it is made on, and the binding that makes it.
 *
 * `start` may throw when the call cannot be made at all; whatever the call reports
 * afterwards goes to `onEvent`.
 */
export type CallTransport<Client, Services> = Readonly<{
  client: Effect.Effect<Client, CallFailure, Services>
  start: (
    client: Client,
    service: DescService,
    method: DescMethod,
    request: ProtobufMessage,
    onEvent: (event: CallEvent) => void
  ) => CallHandle
}>

/**
 * Start a call and file it under the channel's id for as long as the scope lasts.
 *
 * The call is filed in the same uninterruptible step that starts it, so a call that is
 * running is always one the scope releases. Releasing removes it from the handles first and
 * then stops it, so it is no longer addressable whether or not stopping it throws.
 */
const acquireCall = (
  channelId: string,
  start: Effect.Effect<CallHandle, CallFailure>
): Effect.Effect<CallHandle, CallFailure, Scope.Scope | RpcHandles> =>
  Effect.gen(function* () {
    const handles = yield* RpcHandles

    return yield* Effect.acquireRelease(
      Effect.tap(start, (handle) => handles.put(channelId, handle)),
      (handle) =>
        handles.take(channelId).pipe(
          Effect.andThen(
            Effect.try({
              try: () => {
                handle.stop()
              },
              catch: describeCallFailure,
            })
          ),
          Effect.ignore
        )
    )
  })

/**
 * Resolve the call's descriptors from the registry the channel's config names, start the
 * call, and report how that went. The request is parsed again here because the channel holds
 * it as text; a request the form let through parses.
 *
 * Everything that can fail is done before the call is started, so a failure leaves nothing
 * running.
 */
const openCall = <Client, Services>(
  transport: CallTransport<Client, Services>,
  { channelId, config }: Model,
  onEvent: (event: CallEvent) => void
): Effect.Effect<Message, never, Scope.Scope | RpcRegistry | RpcHandles | Services> =>
  Effect.gen(function* () {
    const { service, method } = yield* Effect.mapError(
      resolveMethod({
        registryId: config.registryId,
        serviceName: config.serviceName,
        methodLocalName: config.methodLocalName,
      }),
      (error) => unknownFailure(error.message)
    )
    const client = yield* transport.client

    const parsed = Descriptors.parseRequest(method.input, config.requestJson)
    if ('error' in parsed) {
      return yield* Effect.fail(unknownFailure(parsed.error))
    }
    const sentJson = yield* Effect.try({
      try: () => formatWireJson(method, parsed.message),
      catch: describeCallFailure,
    })

    yield* acquireCall(
      channelId,
      Effect.try({
        try: () => transport.start(client, service, method, parsed.message, onEvent),
        catch: describeCallFailure,
      })
    )

    return Message.SucceededOpenCall({ sent: yield* stampJson(sentJson) })
  }).pipe(
    Effect.catch((failure) =>
      Effect.map(reportError(failure), (error) => Message.FailedOpenCall({ error }))
    )
  )

/**
 * The live side of a channel over a given transport.
 *
 * Opens the call the channel's Model names and keeps it filed under the channel's id until
 * the scope closes, which stops it. Emits whether the call opened, then what it reports:
 * responses in windows of about a tenth of a second, its end, its failure. A call that cannot
 * be opened is a `FailedOpenCall` Message, never a failure of the Effect.
 */
export const makeConnect =
  <Client, Services>(transport: CallTransport<Client, Services>) =>
  (
    channel: Model,
    emit: (message: Message) => void
  ): Effect.Effect<void, never, Scope.Scope | RpcRegistry | RpcHandles | Services> =>
    Effect.gen(function* () {
      const events = yield* Effect.acquireRelease(Queue.unbounded<CallEvent>(), Queue.shutdown)
      yield* Effect.forkScoped(forwardEvents(events, emit))

      const opened = yield* openCall(transport, channel, (event) => {
        Queue.offerUnsafe(events, event)
      })
      emit(opened)
    })

/** The live side of a channel on the console's dxLink connection. */
export const connect: ChannelConnect<Model, Message, RpcServices> = makeConnect({
  client: Effect.catchTag(DxLinkClient.get, 'ResourceNotAvailable', () =>
    Effect.fail(unknownFailure('RPC channel opened without an active connection'))
  ),
  start: startCall,
})
