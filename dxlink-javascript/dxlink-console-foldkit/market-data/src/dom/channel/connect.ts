import { Array, Duration, Effect, Queue, Schema, type Scope, Stream, pipe } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import {
  type DXLinkChannelState,
  type DXLinkClient,
  DXLinkDepthOfMarket,
  type DXLinkError,
  DXLinkLogLevel,
  type DepthOfMarketConfig,
  type DepthOfMarketOrder,
} from '@dxfeed/dxlink-api'
import {
  type ChannelConnect,
  type ChannelHandles,
  DxLinkClient,
  describeChannelParameters,
  reportError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { Book, Config, Ladder } from '../domain'
import { errorMessage, reportFailure } from '../failure'
import { type DomHandle, DomHandles, type DomServices } from '../service'
import { Message } from './message'
import { ChannelState, type Model } from './model'

type Emit = (message: Message) => void

/** How long events are gathered before they are let through (~10 fps). */
const FLUSH_INTERVAL = Duration.millis(100)

const MAX_BATCH_SIZE = 4096

/** What a live DOM channel reports through its listeners, before it becomes a Message. */
export const DomEvent = defineTaggedUnion({
  Snapshot: { snapshot: Book.DomSnapshot },
  ChangedState: { channelState: ChannelState },
  ChangedConfig: { applied: Config.AppliedConfig },
  Failed: { type: Schema.String, message: Schema.String },
})
export type DomEvent = typeof DomEvent.Type

/**
 * Drop every snapshot that a later snapshot replaces.
 *
 * A snapshot is a full replacement of the book, so within one batch only the last one can
 * ever be seen. Everything else keeps its place and its order.
 */
export const coalesceSnapshots = (events: ReadonlyArray<DomEvent>): ReadonlyArray<DomEvent> =>
  Array.filter(
    events,
    (event, index) =>
      event._tag !== 'Snapshot' ||
      pipe(
        Array.drop(events, index + 1),
        Array.every((later) => later._tag !== 'Snapshot')
      )
  )

const toMessage = (event: DomEvent): Effect.Effect<Message> =>
  DomEvent.match(event, {
    Snapshot: ({ snapshot }) => Effect.succeed(Message.ReceivedSnapshot({ snapshot })),
    ChangedState: ({ channelState }) =>
      Effect.succeed(Message.ChangedChannelState({ channelState })),
    ChangedConfig: ({ applied }) => Effect.succeed(Message.ChangedAppliedConfig({ applied })),
    Failed: ({ type, message }) =>
      Effect.map(reportError({ type, message }), (error) =>
        Message.ReportedChannelError({ error })
      ),
  })

/**
 * Emit what a live channel reports, for as long as this Effect runs.
 *
 * Events are gathered for {@link FLUSH_INTERVAL} and snapshots coalesced to the latest, so a
 * busy book updates the Model about ten times a second however fast the server sends. An
 * error is stamped with the time its batch is let through.
 */
export const forwardEvents = (queue: Queue.Dequeue<DomEvent>, emit: Emit): Effect.Effect<void> =>
  pipe(
    Stream.fromQueue(queue),
    Stream.groupedWithin(MAX_BATCH_SIZE, FLUSH_INTERVAL),
    Stream.map(coalesceSnapshots),
    Stream.flattenIterable,
    Stream.mapEffect(toMessage),
    Stream.runForEach((message) => Effect.sync(() => emit(message)))
  )

/**
 * Stop listening to a live channel and close it. The channel is closed even when removing a
 * listener throws.
 */
const release = ({ dom, detach }: DomHandle): Effect.Effect<void, string> =>
  Effect.try({
    try: () => {
      try {
        detach()
      } finally {
        dom.close()
      }
    },
    catch: errorMessage,
  })

/** A live channel that is being listened to, and what it said about itself when it opened. */
export type OpenedDom = Readonly<{
  handle: DomHandle
  succeeded: typeof Message.SucceededOpenDomChannel.Type
}>

/**
 * Open the protocol channel a card asks for and start listening to it.
 *
 * Everything the channel reports afterwards is offered to `events`. The log level is DEBUG
 * because a debug console wants the protocol traffic in the browser log.
 *
 * The result is a live channel with every listener attached, or a failure with nothing left
 * behind: a channel that was constructed but could not be listened to or read is closed
 * before the Effect fails.
 */
export const openDom = (
  client: DXLinkClient,
  config: Config.DomConfig,
  events: Queue.Enqueue<DomEvent>
): Effect.Effect<OpenedDom, string> =>
  Effect.gen(function* () {
    const dom = yield* Effect.try({
      try: () =>
        new DXLinkDepthOfMarket(
          client,
          { symbol: config.symbol, sources: Array.fromIterable(Ladder.parseList(config.source)) },
          {
            ...(config.feed === '' ? {} : { feed: config.feed }),
            ...(config.space === '' ? {} : { space: config.space }),
            logLevel: DXLinkLogLevel.DEBUG,
          }
        ),
      catch: errorMessage,
    })

    const handleSnapshot = (
      time: number,
      bids: ReadonlyArray<DepthOfMarketOrder>,
      asks: ReadonlyArray<DepthOfMarketOrder>
    ) => {
      Queue.offerUnsafe(
        events,
        DomEvent.Snapshot({
          snapshot: { time, bids: Book.toOrders(bids), asks: Book.toOrders(asks) },
        })
      )
    }
    const handleConfig = (applied: DepthOfMarketConfig) => {
      Queue.offerUnsafe(
        events,
        DomEvent.ChangedConfig({ applied: Config.toAppliedConfig(applied) })
      )
    }
    const handleState = (channelState: DXLinkChannelState) => {
      Queue.offerUnsafe(events, DomEvent.ChangedState({ channelState }))
    }
    const handleError = (error: DXLinkError) => {
      Queue.offerUnsafe(events, DomEvent.Failed({ type: error.type, message: error.message }))
    }
    const handle: DomHandle = {
      dom,
      detach: () => {
        dom.removeSnapshotListener(handleSnapshot)
        dom.removeConfigChangeListener(handleConfig)
        dom.removeStateChangeListener(handleState)
        dom.getChannel().removeErrorListener(handleError)
      },
    }

    const succeeded = yield* Effect.try({
      try: () => {
        dom.addSnapshotListener(handleSnapshot)
        dom.addConfigChangeListener(handleConfig)
        dom.addStateChangeListener(handleState)
        dom.getChannel().addErrorListener(handleError)

        return Message.SucceededOpenDomChannel({
          protocolChannelId: dom.id,
          parameters: describeChannelParameters(dom.getChannel().parameters),
          channelState: dom.getState(),
          applied: Config.toAppliedConfig(dom.getConfig()),
        })
      },
      catch: errorMessage,
    }).pipe(Effect.tapError(() => Effect.ignore(release(handle))))

    return { handle, succeeded }
  })

/**
 * Hold a live channel for the lifetime of the scope.
 *
 * While the scope is open the handle is registered under the card's id, where the Commands
 * of the channel find it. When the scope closes the handle is removed, its listeners are
 * detached and the protocol channel is closed. A channel that fails to open registers nothing.
 */
export const acquireHandle = <Acquired extends Readonly<{ handle: DomHandle }>>(
  handles: ChannelHandles<DomHandle>,
  channelId: string,
  open: Effect.Effect<Acquired, string>
): Effect.Effect<Acquired, string, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tap(open, ({ handle }) => handles.put(channelId, handle)),
    ({ handle }) => Effect.andThen(handles.take(channelId), Effect.ignore(release(handle)))
  )

const emitFailedOpen = (message: string, emit: Emit): Effect.Effect<void> =>
  Effect.map(reportFailure(message), (error) => {
    emit(Message.FailedOpenDomChannel({ error }))
  })

/**
 * The live side of one DOM channel on a given client: {@link connect} without the lookup of
 * the session's client.
 */
export const connectWith = (
  client: DXLinkClient,
  channel: Model,
  emit: Emit
): Effect.Effect<void, never, Scope.Scope | DomHandles> =>
  Effect.gen(function* () {
    const handles = yield* DomHandles
    const events = yield* Queue.unbounded<DomEvent>()
    const opened = yield* acquireHandle(
      handles,
      channel.channelId,
      openDom(client, channel.config, events)
    )

    yield* Effect.sync(() => emit(opened.succeeded))
    yield* Effect.forkScoped(forwardEvents(events, emit))
  }).pipe(Effect.catch((message) => emitFailedOpen(message, emit)))

/**
 * The live side of one DOM channel.
 *
 * Opens the protocol channel the card was created for and reports the result as
 * `SucceededOpenDomChannel` or `FailedOpenDomChannel`. From then until the scope closes it
 * emits what the channel reports — snapshots, state and configuration changes, errors — in
 * batches, and keeps the channel registered in {@link DomHandles}. Closing the scope closes
 * the protocol channel.
 */
export const connect: ChannelConnect<Model, Message, DomServices> = (channel, emit) =>
  Effect.matchEffect(DxLinkClient.get, {
    onFailure: () => emitFailedOpen('DOM channel opened without an active connection', emit),
    onSuccess: (client) => connectWith(client, channel, emit),
  })
