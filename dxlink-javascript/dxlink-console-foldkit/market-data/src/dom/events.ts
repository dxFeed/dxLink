import { Array, Duration, Effect, Stream, pipe } from 'effect'

import { type ChannelEvent, reportError } from '@dxfeed/dxlink-console-foldkit-core'

import { DomEvent, DomHandles, type DomServices } from './handles'
import { Message } from './message'

/** How long snapshots are gathered before the latest one is let through (~10 fps). */
const FLUSH_INTERVAL = Duration.millis(100)

const MAX_BATCH_SIZE = 4096

/**
 * Drop every snapshot that a later snapshot of the same channel replaces.
 *
 * A snapshot is a full replacement of the book, so within one batch only the last one per
 * channel can ever be seen. Everything else keeps its place and its order.
 */
export const coalesceSnapshots = (
  events: ReadonlyArray<ChannelEvent<DomEvent>>
): ReadonlyArray<ChannelEvent<DomEvent>> =>
  Array.filter(
    events,
    (event, index) =>
      event.message._tag !== 'Snapshot' ||
      pipe(
        Array.drop(events, index + 1),
        Array.every(
          (later) => later.channelId !== event.channelId || later.message._tag !== 'Snapshot'
        )
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
 * Every Message the live DOM channels produce, each addressed to its card.
 *
 * Events are gathered for {@link FLUSH_INTERVAL} and snapshots coalesced to the latest, so a
 * busy book updates the Model about ten times a second however fast the server sends.
 */
export const events: Stream.Stream<ChannelEvent<Message>, never, DomServices> = pipe(
  Stream.unwrap(
    Effect.gen(function* () {
      const handles = yield* DomHandles

      return handles.events
    })
  ),
  Stream.groupedWithin(MAX_BATCH_SIZE, FLUSH_INTERVAL),
  Stream.map(coalesceSnapshots),
  Stream.flattenIterable,
  Stream.mapEffect(({ channelId, message }) =>
    Effect.map(toMessage(message), (channelMessage) => ({
      channelId,
      message: channelMessage,
    }))
  )
)
