import { Array, Duration, Effect, Match, Option, Stream } from 'effect'

import type { FeedConfig as AppliedFeedConfig } from '@dxfeed/dxlink-api'
import { type ChannelEvent, reportError } from '@dxfeed/dxlink-console-foldkit-core'

import { toFeedEvent } from './domain'
import { FeedLive, type FeedSignal } from './live'
import { Message } from './message'
import type { AppliedConfig } from './model'

/** How long incoming signals are gathered before they become Messages: about ten a second. */
const FLUSH_INTERVAL = Duration.millis(100)

/** Upper bound of one gathered batch; a busier feed simply flushes sooner. */
const MAX_BATCH = 4096

type Signal = ChannelEvent<FeedSignal>

/**
 * Merge the event signals of each channel within one gathered batch.
 *
 * An event signal joins the latest signal of its channel when that one carries events too,
 * so a burst of frames costs one Message — and one render — per channel, while the order of
 * events relative to a config or state change of the same channel is kept.
 */
export const coalesce = (signals: ReadonlyArray<Signal>): ReadonlyArray<Signal> =>
  Array.reduce(signals, Array.empty<Signal>(), (merged, signal) => {
    const { channelId, message } = signal
    if (message._tag !== 'Events') {
      return Array.append(merged, signal)
    }

    return Option.match(
      Array.findLastIndex(merged, (previous) => previous.channelId === channelId),
      {
        onNone: () => Array.append(merged, signal),
        onSome: (index) => {
          const previous = merged[index]

          if (previous === undefined || previous.message._tag !== 'Events') {
            return Array.append(merged, signal)
          }
          const joined: Signal = {
            channelId,
            message: {
              _tag: 'Events',
              events: [...previous.message.events, ...message.events],
            },
          }

          return Array.map(merged, (entry, position) => (position === index ? joined : entry))
        },
      }
    )
  })

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
      Effect.succeed(Message.ReceivedEvents({ events: Array.map(events, toFeedEvent) }))
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
    Match.tag('Candles', ({ count }) =>
      Effect.succeed(Message.ReceivedCandles({ candleCount: count }))
    ),
    Match.tag('ChartFailure', ({ reason }) =>
      Effect.succeed(Message.FailedDrawCandles({ reason }))
    ),
    Match.exhaustive
  )

/**
 * Every Message the plugin's live channels produce on their own, each addressed to its
 * channel. Signals are gathered for {@link FLUSH_INTERVAL} and coalesced, which bounds how
 * often a busy feed can make the console update and render.
 */
export const events: Stream.Stream<ChannelEvent<Message>, never, FeedLive> = Stream.unwrap(
  Effect.gen(function* () {
    const handles = yield* FeedLive

    return handles.events
  })
).pipe(
  Stream.groupedWithin(MAX_BATCH, FLUSH_INTERVAL),
  Stream.mapEffect((batch) =>
    Effect.forEach(coalesce(batch), ({ channelId, message }) =>
      Effect.map(toMessage(message), (feedMessage) => ({
        channelId,
        message: feedMessage,
      }))
    )
  ),
  Stream.flattenIterable
)
