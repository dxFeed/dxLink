import { DXLinkLogLevel } from '@dxfeed/dxlink-api'
import type { DXLinkClient, DXLinkIndiChartCandle } from '@dxfeed/dxlink-api'
import {
  channelStateAtoms,
  command,
  makeChannelAtoms,
  on,
  session,
  trackChannel,
} from '@dxfeed/dxlink-console-core'
import type { ChannelAtoms, Session } from '@dxfeed/dxlink-console-core'
import { Effect } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'

import { DXLinkCandles } from './candles'
import type { DXLinkCandleEvent, DXLinkCandleSubscription } from './candles'

/** How the chart consumes a batch of candles: a fresh snapshot or an incremental update. */
export type CandleChartListener = (
  candles: DXLinkIndiChartCandle[],
  dataType: 'candles' | 'update'
) => void

const toChartCandle = (event: DXLinkCandleEvent): DXLinkIndiChartCandle => ({
  eventSymbol: event.eventSymbol,
  index: event.index,
  time: event.time,
  open: event.open,
  high: event.high,
  low: event.low,
  close: event.close,
  volume: event.volume,
})

/** The Feed candle-chart view's channel — wraps {@link DXLinkCandles}. */
export interface FeedCandlesModel {
  readonly channel: ChannelAtoms
  readonly session: Session<DXLinkCandles | null>
  readonly subscription: Atom.Atom<DXLinkCandleSubscription | null>
  readonly candleCount: Atom.Atom<number>
  readonly setSubscription: Atom.Writable<void, DXLinkCandleSubscription>
}

/**
 * The model for the Feed candle-chart view.
 *
 * Candle batches go straight to `onCandles`, not into an atom: the chart consumes data through
 * a ref, and a snapshot must be followed by every update after it in order, which a state
 * value — holding only the latest — would not guarantee. Channel state and counts go to atoms.
 */
export const makeFeedCandlesModel = (
  client: DXLinkClient,
  params: { feed?: string; space?: string },
  onCandles: CandleChartListener
): FeedCandlesModel => {
  const channel = makeChannelAtoms()
  const subscription = Atom.make<DXLinkCandleSubscription | null>(null)
  const candleCount = Atom.make(0)

  const candlesSession = session({
    state: [...channelStateAtoms(channel), subscription, candleCount],
    open: (get) => {
      if (get(channel.closed)) {
        return Effect.succeed(null)
      }

      return Effect.gen(function* () {
        const registry = yield* AtomRegistry
        const candles = yield* Effect.acquireRelease(
          Effect.sync(
            () =>
              new DXLinkCandles(client, {
                feed: params.feed,
                space: params.space,
                // A debug console wants the protocol traffic in the browser log.
                logLevel: DXLinkLogLevel.DEBUG,
              })
          ),
          (candles) => Effect.sync(() => candles.close())
        )
        yield* trackChannel(channel, candles.getChannel())
        yield* on(candles, 'Data', (data) => {
          const batch = data.events.map(toChartCandle)
          registry.set(candleCount, batch.length)
          onCandles(batch, data.isSnapshot ? 'candles' : 'update')
        })

        const current = registry.get(subscription)
        if (current !== null) {
          candles.setSubscription(current)
        }

        return candles
      })
    },
  })

  return {
    channel,
    session: candlesSession,
    subscription,
    candleCount,

    setSubscription: command((ctx, next: DXLinkCandleSubscription) => {
      ctx.set(subscription, next)
      ctx.set(candleCount, 0)
      candlesSession.current()?.setSubscription(next)
    }),
  }
}
