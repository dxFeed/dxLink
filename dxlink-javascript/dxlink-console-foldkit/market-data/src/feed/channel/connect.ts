import {
  Array,
  Duration,
  Effect,
  Match,
  MutableRef,
  Option,
  Queue,
  type Scope,
  Stream,
} from 'effect'

import {
  type FeedConfig as AppliedFeedConfig,
  type DXLinkChannel,
  type DXLinkChannelState,
  type DXLinkClient,
  type DXLinkError,
  DXLinkFeed,
  DXLinkLogLevel,
  FeedContract,
  type FeedEventData,
} from '@dxfeed/dxlink-api'
import {
  DxLinkClient,
  describeChannelParameters,
  reportError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { Candles, Feed } from '../domain'
import { CandleChartSink, removeSink, setSink } from '../live/chartSink'
import { attempt, describe, reportFailure } from '../live/failure'
import { type FeedHandle, FeedLive } from '../live/service'
import { Message } from './message'
import { type AppliedConfig, type Model, View } from './model'

/** How long incoming signals are gathered before they become Messages: about ten a second. */
const FLUSH_INTERVAL = Duration.millis(100)

/** Upper bound of one gathered batch; a busier feed simply flushes sooner. */
const MAX_BATCH = 4096

/**
 * What a live FEED channel reports, as its listeners see it. Signals are gathered into
 * batches before they become Messages, which is where event bursts are coalesced and errors
 * are stamped.
 */
export type FeedSignal =
  | Readonly<{ _tag: 'Events'; events: ReadonlyArray<FeedEventData> }>
  | Readonly<{ _tag: 'Config'; config: AppliedFeedConfig }>
  | Readonly<{ _tag: 'State'; state: DXLinkChannelState }>
  | Readonly<{ _tag: 'Error'; type: string; message: string }>
  | Readonly<{ _tag: 'Candles'; generation: number; count: number }>
  | Readonly<{ _tag: 'ChartFailure'; generation: number; reason: string }>

/**
 * Merge runs of event signals within one gathered batch.
 *
 * An event signal joins the signal before it when that one carries events too, so a burst of
 * frames costs one Message — and one render — while the order of events relative to a config
 * or state change is kept.
 */
export const coalesce = (signals: ReadonlyArray<FeedSignal>): ReadonlyArray<FeedSignal> =>
  Array.reduce(signals, Array.empty<FeedSignal>(), (merged, signal) =>
    Option.match(Array.last(merged), {
      onNone: () => Array.append(merged, signal),
      onSome: (previous) => {
        if (previous._tag !== 'Events' || signal._tag !== 'Events') {
          return Array.append(merged, signal)
        }
        const joined: FeedSignal = {
          _tag: 'Events',
          events: [...previous.events, ...signal.events],
        }

        return Array.append(Array.dropRight(merged, 1), joined)
      },
    })
  )

export const toAppliedConfig = (config: AppliedFeedConfig): AppliedConfig => ({
  maybeAggregationPeriod: Option.liftPredicate(
    config.aggregationPeriod,
    (period) => !Number.isNaN(period)
  ),
  dataFormat: config.dataFormat,
  eventFields: config.eventFields,
})

const toMessage = (signal: FeedSignal): Effect.Effect<Message> =>
  Match.value(signal).pipe(
    Match.withReturnType<Effect.Effect<Message>>(),
    Match.tag('Events', ({ events }) =>
      Effect.succeed(Message.ReceivedEvents({ events: Array.map(events, Feed.toFeedEvent) }))
    ),
    Match.tag('Config', ({ config }) =>
      Effect.succeed(Message.ChangedAppliedConfig({ applied: toAppliedConfig(config) }))
    ),
    Match.tag('State', ({ state }) =>
      Effect.succeed(Message.ChangedChannelState({ channelState: state }))
    ),
    Match.tag('Error', ({ type, message }) =>
      Effect.map(reportError({ type, message }), (error) => Message.ReportedChannelError({ error }))
    ),
    Match.tag('Candles', ({ generation, count }) =>
      Effect.succeed(Message.ReceivedCandles({ generation, candleCount: count }))
    ),
    Match.tag('ChartFailure', ({ generation, reason }) =>
      Effect.succeed(Message.FailedDrawCandles({ generation, reason }))
    ),
    Match.exhaustive
  )

/**
 * Turn the signals of one channel into its Messages for as long as it runs. Signals are
 * gathered for {@link FLUSH_INTERVAL} and coalesced, which bounds how often a busy feed can
 * make the console update and render.
 */
const pump = (
  signals: Queue.Dequeue<FeedSignal>,
  emit: (message: Message) => void
): Effect.Effect<void> =>
  Stream.fromQueue(signals).pipe(
    Stream.groupedWithin(MAX_BATCH, FLUSH_INTERVAL),
    Stream.runForEach((batch) =>
      Effect.forEach(
        coalesce(batch),
        (signal) =>
          Effect.flatMap(toMessage(signal), (message) =>
            Effect.sync(() => {
              emit(message)
            })
          ),
        { discard: true }
      )
    )
  )

/** Feed and space are omitted from the protocol when empty; DEBUG puts the traffic in the log. */
const feedOptions = (feed: string, space: string) => ({
  ...(feed === '' ? {} : { feed }),
  ...(space === '' ? {} : { space }),
  logLevel: DXLinkLogLevel.DEBUG,
})

const opened = (channel: DXLinkChannel) =>
  Message.SucceededOpenChannel({
    channelState: channel.getState(),
    protocolChannelId: channel.id,
    parameters: describeChannelParameters(channel.parameters),
  })

/**
 * Build a live dxLink object and wire it up, returning what `wire` made of it.
 *
 * An object exists — and holds its protocol channel — from the moment `make` returns, so one
 * whose wiring throws is closed before the failure is reported: a failed open leaves nothing
 * behind.
 */
export const acquireWired = <Live, Wired>(
  make: () => Live,
  wire: (live: Live) => Wired,
  close: (live: Live) => void
): Effect.Effect<Wired, string> =>
  Effect.flatMap(attempt(make), (live) =>
    Effect.tapError(
      attempt(() => wire(live)),
      () => Effect.ignore(attempt(() => close(live)))
    )
  )

/** A channel that is open and listened to: its handle, and the Message that says it opened. */
type OpenedHandle = Readonly<{ handle: FeedHandle; message: Message }>

type Offer = (signal: FeedSignal) => void

const offerError =
  (offer: Offer) =>
  (error: DXLinkError): void => {
    offer({ _tag: 'Error', type: error.type, message: error.message })
  }

/** Open an AUTO-contract feed, which accepts all three subscription shapes. */
const openFeed = (
  client: DXLinkClient,
  channel: Model,
  offer: Offer
): Effect.Effect<OpenedHandle, string> =>
  acquireWired(
    () => new DXLinkFeed(client, FeedContract.AUTO, feedOptions(channel.feed, channel.space)),
    (feed): OpenedHandle => {
      feed.addEventListener((events) => {
        offer({ _tag: 'Events', events })
      })
      feed.addConfigChangeListener((config) => {
        offer({ _tag: 'Config', config })
      })
      feed.addStateChangeListener((state) => {
        offer({ _tag: 'State', state })
      })
      feed.getChannel().addErrorListener(offerError(offer))

      return { handle: { _tag: 'Feed', feed }, message: opened(feed.getChannel()) }
    },
    (feed) => {
      feed.close()
    }
  )

/**
 * Open the candle aggregator behind the chart view, drawing into `sink`. What it reports is
 * stamped with the generation the channel is serving at that moment.
 */
const openCandles = (
  client: DXLinkClient,
  channel: Model,
  sink: CandleChartSink,
  offer: Offer
): Effect.Effect<OpenedHandle, string> =>
  acquireWired(
    () => new Candles.DXLinkCandles(client, feedOptions(channel.feed, channel.space)),
    (candles): OpenedHandle => {
      const generation = MutableRef.make(0)
      candles.addListener((data) => {
        const reportedUnder = MutableRef.get(generation)
        // NOTE: this runs synchronously inside the WebSocket frame dispatch, which does
        // not guard its listeners: an escaping throw would abort that frame for every
        // other channel. A drawing failure is contained and reported instead.
        try {
          sink.push(data.events, data.isSnapshot)
        } catch (error) {
          offer({ _tag: 'ChartFailure', generation: reportedUnder, reason: describe(error) })
        }
        offer({ _tag: 'Candles', generation: reportedUnder, count: data.events.length })
      })
      const protocolChannel = candles.getChannel()
      protocolChannel.addStateChangeListener((state) => {
        offer({ _tag: 'State', state })
      })
      protocolChannel.addErrorListener(offerError(offer))

      return {
        handle: { _tag: 'Candles', candles, sink, generation },
        message: opened(protocolChannel),
      }
    },
    (candles) => {
      candles.close()
    }
  )

const closeHandle = (handle: FeedHandle): void => {
  if (handle._tag === 'Feed') {
    handle.feed.close()
  } else {
    handle.candles.close()
  }
}

/**
 * Open a channel and keep its handle in the handles service for the rest of the scope. The
 * finalizer removes the handle and closes the channel, which sends CHANNEL_CANCEL.
 */
const holdHandle = (
  channelId: string,
  open: Effect.Effect<OpenedHandle, string>
): Effect.Effect<OpenedHandle, string, Scope.Scope | FeedLive> =>
  Effect.gen(function* () {
    const handles = yield* FeedLive

    return yield* Effect.acquireRelease(
      Effect.tap(open, ({ handle }) => handles.put(channelId, handle)),
      ({ handle }) =>
        Effect.andThen(handles.take(channelId), Effect.ignore(attempt(() => closeHandle(handle))))
    )
  })

/** Make a channel's sink findable by its chart's Mount for the rest of the scope. */
const registerSink = (
  channelId: string,
  sink: CandleChartSink
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      setSink(channelId, sink)
    }),
    () =>
      Effect.sync(() => {
        removeSink(channelId, sink)
      })
  )

/**
 * The candle channel of a chart view, with the sink its candles are drawn into. The sink is
 * registered only once the channel's handle is held, so a failed open registers nothing.
 */
const holdCandles = (
  client: DXLinkClient,
  channel: Model,
  offer: Offer
): Effect.Effect<OpenedHandle, string, Scope.Scope | FeedLive> =>
  Effect.gen(function* () {
    const sink = yield* Effect.sync(() => new CandleChartSink())
    const openedHandle = yield* holdHandle(
      channel.channelId,
      openCandles(client, channel, sink, offer)
    )
    yield* registerSink(channel.channelId, sink)

    return openedHandle
  })

/**
 * The live side of one FEED channel, on the client `acquireClient` yields.
 *
 * Within the scope it runs in: the channel's dxLink object is open and its handle is in the
 * handles service, a chart channel's sink is registered for its Mount, and what the channel
 * reports is emitted in batches. All of that is released with the scope. The result of
 * opening is emitted once: `SucceededOpenChannel`, or `FailedOpenChannel` when the client is
 * not available or the channel could not be built, in which case nothing is left open.
 */
export const connectWith =
  <E, R>(acquireClient: Effect.Effect<DXLinkClient, E, R>) =>
  (
    channel: Model,
    emit: (message: Message) => void
  ): Effect.Effect<void, never, Scope.Scope | FeedLive | R> =>
    Effect.gen(function* () {
      const signals = yield* Effect.acquireRelease(Queue.unbounded<FeedSignal>(), Queue.shutdown)
      const offer: Offer = (signal) => {
        Queue.offerUnsafe(signals, signal)
      }
      const client = yield* Effect.mapError(acquireClient, () =>
        View.match(channel.view, {
          Subscriptions: () => 'Feed channel opened without an active connection',
          Chart: () => 'Feed chart channel opened without an active connection',
        })
      )
      const openedHandle = yield* View.match(channel.view, {
        Subscriptions: () => holdHandle(channel.channelId, openFeed(client, channel, offer)),
        Chart: () => holdCandles(client, channel, offer),
      })
      yield* Effect.forkScoped(pump(signals, emit))

      return openedHandle.message
    }).pipe(
      Effect.catch(reportFailure((error) => Message.FailedOpenChannel({ error }))),
      Effect.flatMap((message) =>
        Effect.sync(() => {
          emit(message)
        })
      )
    )

/** The live side of one FEED channel, on the client of the current session. */
export const connect = connectWith(DxLinkClient.get)
