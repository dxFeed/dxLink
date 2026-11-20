import { Effect, MutableRef, Option, Schema } from 'effect'
import { Command, Mount } from 'foldkit'

import {
  type DXLinkChannel,
  type DXLinkError,
  DXLinkFeed,
  DXLinkLogLevel,
  FeedContract,
  FeedDataFormat,
} from '@dxfeed/dxlink-api'
import {
  DxLinkClient,
  type ReportedError,
  describeChannelParameters,
  reportError,
} from '@dxfeed/dxlink-console-foldkit-core'

import { CandleChartSink, findSink, registerSink, unregisterSink } from './candleChart'
import { DXLinkCandles } from './candles'
import {
  EventFieldRow,
  FeedSubscription,
  buildAcceptEventFields,
  subscriptionKey,
  toProtocolSubscription,
} from './domain'
import { type FeedHandle, FeedLive } from './live'
import { Message } from './message'
import { CandleSubscription, DataFormatChoice } from './model'

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

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Run a dxLink call, which may throw, as an Effect that fails with the reason instead. */
const attempt = <A>(act: () => A): Effect.Effect<A, string> =>
  Effect.try({ try: act, catch: describe })

/**
 * Turn a failure reason into the Command's `Failed*` Message, stamped with the time it was
 * observed at.
 */
const reportFailure =
  <Failed>(toMessage: (error: ReportedError) => Failed) =>
  (reason: string): Effect.Effect<Failed> =>
    Effect.map(reportError({ type: 'CONSOLE', message: reason }), toMessage)

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

const OpenArgs = {
  channelId: Schema.String,
  feed: Schema.String,
  space: Schema.String,
}

/** Open an AUTO-contract feed, which accepts all three subscription shapes. */
export const OpenFeed = Command.define('OpenFeed', {
  args: OpenArgs,
  messages: [Message.SucceededOpenChannel, Message.FailedOpenChannel],
  execute: ({ channelId, feed, space }) =>
    Effect.gen(function* () {
      const client = yield* DxLinkClient.get
      const handles = yield* FeedLive
      const wired = yield* acquireWired(
        () => new DXLinkFeed(client, FeedContract.AUTO, feedOptions(feed, space)),
        (dxFeed) => {
          dxFeed.addEventListener((events) => {
            handles.emit(channelId, { _tag: 'Events', events })
          })
          dxFeed.addConfigChangeListener((config) => {
            handles.emit(channelId, { _tag: 'Config', config })
          })
          dxFeed.addStateChangeListener((state) => {
            handles.emit(channelId, { _tag: 'State', state })
          })
          dxFeed.getChannel().addErrorListener((error: DXLinkError) => {
            handles.emit(channelId, {
              _tag: 'Error',
              type: error.type,
              message: error.message,
            })
          })

          return { feed: dxFeed, message: opened(dxFeed.getChannel()) }
        },
        (dxFeed) => {
          dxFeed.close()
        }
      )
      yield* handles.put(channelId, { _tag: 'Feed', feed: wired.feed })

      return wired.message
    }).pipe(
      Effect.catchTag('ResourceNotAvailable', () =>
        Effect.fail('Feed channel opened without an active connection')
      ),
      Effect.catch(reportFailure((error) => Message.FailedOpenChannel({ error })))
    ),
})

/**
 * Open the candle aggregator behind the chart view, with the sink its candles are drawn
 * into. The sink is registered for the chart's Mount only once the channel's handle is held,
 * so a failed open registers nothing.
 */
export const OpenCandles = Command.define('OpenCandles', {
  args: OpenArgs,
  messages: [Message.SucceededOpenChannel, Message.FailedOpenChannel],
  execute: ({ channelId, feed, space }) =>
    Effect.gen(function* () {
      const client = yield* DxLinkClient.get
      const handles = yield* FeedLive
      const sink = new CandleChartSink()
      const generation = MutableRef.make(0)
      const wired = yield* acquireWired(
        () => new DXLinkCandles(client, feedOptions(feed, space)),
        (candles) => {
          candles.addListener((data) => {
            const reportedUnder = MutableRef.get(generation)
            // NOTE: this runs synchronously inside the WebSocket frame dispatch, which does
            // not guard its listeners: an escaping throw would abort that frame for every
            // other channel. A drawing failure is contained and reported instead.
            try {
              sink.push(data.events, data.isSnapshot)
            } catch (error) {
              handles.emit(channelId, {
                _tag: 'ChartFailure',
                generation: reportedUnder,
                reason: describe(error),
              })
            }
            handles.emit(channelId, {
              _tag: 'Candles',
              generation: reportedUnder,
              count: data.events.length,
            })
          })
          const channel = candles.getChannel()
          channel.addStateChangeListener((state) => {
            handles.emit(channelId, { _tag: 'State', state })
          })
          channel.addErrorListener((error: DXLinkError) => {
            handles.emit(channelId, {
              _tag: 'Error',
              type: error.type,
              message: error.message,
            })
          })

          return { candles, message: opened(channel) }
        },
        (candles) => {
          candles.close()
        }
      )
      yield* handles.put(channelId, {
        _tag: 'Candles',
        candles: wired.candles,
        sink,
        generation,
      })
      yield* Effect.sync(() => {
        registerSink(channelId, sink)
      })

      return wired.message
    }).pipe(
      Effect.catchTag('ResourceNotAvailable', () =>
        Effect.fail('Feed chart channel opened without an active connection')
      ),
      Effect.catch(reportFailure((error) => Message.FailedOpenChannel({ error })))
    ),
})

/** The channel's live handle. A channel without one cannot be acted on, which is a failure. */
const liveHandle = (channelId: string): Effect.Effect<FeedHandle, string, FeedLive> =>
  Effect.gen(function* () {
    const handles = yield* FeedLive
    const maybeHandle = yield* handles.get(channelId)

    return yield* Effect.mapError(
      Effect.fromOption(maybeHandle),
      () => 'The channel has no live feed behind it'
    )
  })

const withFeed = <A>(
  channelId: string,
  act: (feed: DXLinkFeed<FeedContract.AUTO>) => A
): Effect.Effect<A, string, FeedLive> =>
  Effect.flatMap(liveHandle(channelId), (handle) =>
    handle._tag === 'Feed'
      ? attempt(() => act(handle.feed))
      : Effect.fail('The channel is a candle chart and takes no feed subscriptions')
  )

const withCandles = <A>(
  channelId: string,
  act: (handle: Extract<FeedHandle, { _tag: 'Candles' }>) => A
): Effect.Effect<A, string, FeedLive> =>
  Effect.flatMap(liveHandle(channelId), (handle) =>
    handle._tag === 'Candles'
      ? attempt(() => act(handle))
      : Effect.fail('The channel is a subscriptions feed and draws no candles')
  )

export const AddSubscription = Command.define('AddSubscription', {
  args: { channelId: Schema.String, subscription: FeedSubscription },
  messages: [Message.SucceededAddSubscription, Message.FailedAddSubscription],
  execute: ({ channelId, subscription }) =>
    withFeed(channelId, (feed) => {
      feed.addSubscriptions([toProtocolSubscription(subscription)])
    }).pipe(
      Effect.as(Message.SucceededAddSubscription({ subscription })),
      Effect.catch(reportFailure((error) => Message.FailedAddSubscription({ error })))
    ),
})

export const RemoveSubscription = Command.define('RemoveSubscription', {
  args: { channelId: Schema.String, subscription: FeedSubscription },
  messages: [Message.SucceededRemoveSubscription, Message.FailedRemoveSubscription],
  execute: ({ channelId, subscription }) =>
    withFeed(channelId, (feed) => {
      feed.removeSubscriptions([toProtocolSubscription(subscription)])
    }).pipe(
      Effect.as(Message.SucceededRemoveSubscription({ key: subscriptionKey(subscription) })),
      Effect.catch(reportFailure((error) => Message.FailedRemoveSubscription({ error })))
    ),
})

export const ClearSubscriptions = Command.define('ClearSubscriptions', {
  args: { channelId: Schema.String },
  messages: [Message.SucceededClearSubscriptions, Message.FailedClearSubscriptions],
  execute: ({ channelId }) =>
    withFeed(channelId, (feed) => {
      feed.clearSubscriptions()
    }).pipe(
      Effect.as(Message.SucceededClearSubscriptions()),
      Effect.catch(reportFailure((error) => Message.FailedClearSubscriptions({ error })))
    ),
})

const toDataFormat = (choice: DataFormatChoice): Option.Option<FeedDataFormat> => {
  if (choice === 'FULL') {
    return Option.some(FeedDataFormat.FULL)
  }

  return choice === 'COMPACT' ? Option.some(FeedDataFormat.COMPACT) : Option.none()
}

/** The typed aggregation period: `None` when left empty, a failure when it is not a number. */
const parseAggregationPeriod = (draft: string): Effect.Effect<Option.Option<number>, string> => {
  if (draft.trim() === '') {
    return Effect.succeedNone
  }
  const period = Number(draft)

  return Number.isFinite(period)
    ? Effect.succeedSome(period)
    : Effect.fail(`Aggregation period "${draft}" is not a number`)
}

/** Send the requested configuration; every empty part is left to the server's default. */
export const ConfigureFeed = Command.define('ConfigureFeed', {
  args: {
    channelId: Schema.String,
    aggregationPeriod: Schema.String,
    dataFormat: DataFormatChoice,
    rows: Schema.Array(EventFieldRow),
  },
  messages: [Message.SucceededConfigureFeed, Message.FailedConfigureFeed],
  execute: ({ channelId, aggregationPeriod, dataFormat, rows }) =>
    Effect.flatMap(parseAggregationPeriod(aggregationPeriod), (maybeAggregationPeriod) =>
      withFeed(channelId, (feed) => {
        feed.configure({
          ...Option.match(maybeAggregationPeriod, {
            onNone: () => ({}),
            onSome: (acceptAggregationPeriod) => ({ acceptAggregationPeriod }),
          }),
          ...Option.match(toDataFormat(dataFormat), {
            onNone: () => ({}),
            onSome: (acceptDataFormat) => ({ acceptDataFormat }),
          }),
          ...Option.match(buildAcceptEventFields(rows), {
            onNone: () => ({}),
            onSome: (acceptEventFields) => ({ acceptEventFields }),
          }),
        })
      })
    ).pipe(
      Effect.as(Message.SucceededConfigureFeed()),
      Effect.catch(reportFailure((error) => Message.FailedConfigureFeed({ error })))
    ),
})

/**
 * Replace the candle subscription; what the chart drew for the previous one is dropped.
 *
 * From here on the channel stamps what it reports with `generation`, which is how a report
 * produced under the previous subscription is recognised after this one replaced it.
 */
export const SetCandleSubscription = Command.define('SetCandleSubscription', {
  args: {
    channelId: Schema.String,
    generation: Schema.Finite,
    subscription: CandleSubscription,
  },
  messages: [Message.SucceededSetCandleSubscription, Message.FailedSetCandleSubscription],
  execute: ({ channelId, generation, subscription }) =>
    withCandles(channelId, (handle) => {
      MutableRef.set(handle.generation, generation)
      handle.sink.reset()
      handle.candles.setSubscription(subscription)
    }).pipe(
      Effect.as(Message.SucceededSetCandleSubscription({ generation })),
      Effect.catch(
        reportFailure((error) => Message.FailedSetCandleSubscription({ generation, error }))
      )
    ),
})

export const CopyEvents = Command.define('CopyEvents', {
  args: { text: Schema.String },
  messages: [Message.SucceededCopyEvents, Message.FailedCopyEvents],
  execute: ({ text }) =>
    Effect.tryPromise({
      try: () => navigator.clipboard.writeText(text),
      catch: (error) => `Could not copy the events: ${describe(error)}`,
    }).pipe(
      Effect.as(Message.SucceededCopyEvents()),
      Effect.catch(reportFailure((error) => Message.FailedCopyEvents({ error })))
    ),
})

/**
 * Closing is terminal: the feed sends CHANNEL_CANCEL and its handle is gone, together with
 * the chart sink registered beside it.
 *
 * A channel with no handle — never opened, or closed already — has nothing to release, so
 * closing it succeeds.
 */
export const CloseChannel = Command.define('CloseChannel', {
  args: { channelId: Schema.String },
  messages: [Message.SucceededCloseChannel, Message.FailedCloseChannel],
  execute: ({ channelId }) =>
    Effect.gen(function* () {
      const handles = yield* FeedLive
      const maybeHandle = yield* handles.take(channelId)
      yield* Effect.sync(() => {
        unregisterSink(channelId)
      })
      yield* Option.match(maybeHandle, {
        onNone: () => Effect.void,
        onSome: (handle) =>
          attempt(() => {
            if (handle._tag === 'Feed') {
              handle.feed.close()
            } else {
              handle.candles.close()
            }
          }),
      })

      return Message.SucceededCloseChannel()
    }).pipe(Effect.catch(reportFailure((error) => Message.FailedCloseChannel({ error })))),
})

/**
 * Build the candle chart in its container, drawing from the sink of the channel's handle.
 * The chart lives as long as the element; the candles it shows live in the sink, so a
 * rebuilt chart starts where the last one left off.
 *
 * It attaches to a sink and never makes one: a channel with no live handle has nothing to
 * draw, and the Mount fails instead.
 */
export const MountChart = Mount.define('MountChart', {
  args: { channelId: Schema.String },
  messages: [Message.SucceededMountChart, Message.FailedMountChart],
  execute: ({ element, channelId }) =>
    Effect.gen(function* () {
      if (!(element instanceof HTMLElement)) {
        return yield* Effect.fail('The chart container is not an HTML element')
      }
      const maybeSink = yield* Effect.sync(() => findSink(channelId))
      const sink = yield* Effect.mapError(
        Effect.fromOption(maybeSink),
        () => 'The channel has no live candle feed to draw'
      )
      yield* Effect.acquireRelease(
        attempt(() => sink.attach(element)),
        (detach) => Effect.ignore(attempt(detach))
      )

      return Message.SucceededMountChart()
    }).pipe(Effect.catch((reason) => Effect.succeed(Message.FailedMountChart({ reason })))),
})
