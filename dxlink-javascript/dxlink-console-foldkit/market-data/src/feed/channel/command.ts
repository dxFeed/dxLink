import { Effect, MutableRef, Option, Schema } from 'effect'
import { Command, Mount } from 'foldkit'

import { type DXLinkFeed, type FeedContract, FeedDataFormat } from '@dxfeed/dxlink-api'

import { Feed } from '../domain'
import { getSink } from '../live/chartSink'
import { attempt, describe, reportFailure } from '../live/failure'
import { type FeedHandle, FeedLive } from '../live/service'
import { Message } from './message'
import { CandleSubscription, DataFormatChoice } from './model'

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
  args: { channelId: Schema.String, subscription: Feed.FeedSubscription },
  messages: [Message.SucceededAddSubscription, Message.FailedAddSubscription],
  execute: ({ channelId, subscription }) =>
    withFeed(channelId, (feed) => {
      feed.addSubscriptions([Feed.toProtocolSubscription(subscription)])
    }).pipe(
      Effect.as(Message.SucceededAddSubscription({ subscription })),
      Effect.catch(reportFailure((error) => Message.FailedAddSubscription({ error })))
    ),
})

export const RemoveSubscription = Command.define('RemoveSubscription', {
  args: { channelId: Schema.String, subscription: Feed.FeedSubscription },
  messages: [Message.SucceededRemoveSubscription, Message.FailedRemoveSubscription],
  execute: ({ channelId, subscription }) =>
    withFeed(channelId, (feed) => {
      feed.removeSubscriptions([Feed.toProtocolSubscription(subscription)])
    }).pipe(
      Effect.as(Message.SucceededRemoveSubscription({ key: Feed.subscriptionKey(subscription) })),
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
    rows: Schema.Array(Feed.EventFieldRow),
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
          ...Option.match(Feed.buildAcceptEventFields(rows), {
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
 * Build the candle chart in its container, drawing from the sink of the channel's handle.
 * The chart lives as long as the element; the candles it shows live in the sink, so a
 * rebuilt chart starts where the last one left off.
 *
 * It attaches to a sink and never makes one: a channel that is not connected has nothing to
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
      const maybeSink = yield* Effect.sync(() => getSink(channelId))
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
