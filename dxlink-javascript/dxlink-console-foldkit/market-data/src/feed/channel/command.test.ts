import { Effect, MutableRef, Option, Stream } from 'effect'
import { Mount } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { DXLinkFeed, DXLinkWebSocketClient, FeedContract } from '@dxfeed/dxlink-api'

import { Candles, Feed } from '../domain'
import { CandleChartSink, getSink } from '../live/chartSink'
import { FeedLive, feedLayer } from '../live/service'
import {
  AddSubscription,
  ClearSubscriptions,
  ConfigureFeed,
  MountChart,
  RemoveSubscription,
  SetCandleSubscription,
} from './command'

const run = <A>(effect: Effect.Effect<A, never, FeedLive>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, feedLayer))

const quoteAapl = Feed.FeedSubscription.Regular({ type: 'Quote', symbol: 'AAPL' })

const NO_HANDLE = 'The channel has no live feed behind it'

/** A real feed on a client that is not connected: it queues what it is asked for. */
const putFeed = (channelId: string) =>
  Effect.gen(function* () {
    const handles = yield* FeedLive
    const client = new DXLinkWebSocketClient()
    const feed = new DXLinkFeed(client, FeedContract.AUTO)
    yield* handles.put(channelId, { _tag: 'Feed', feed })

    return feed
  })

const putCandles = (channelId: string) =>
  Effect.gen(function* () {
    const handles = yield* FeedLive
    const client = new DXLinkWebSocketClient()
    const candles = new Candles.DXLinkCandles(client)
    const sink = new CandleChartSink()
    const generation = MutableRef.make(0)
    yield* handles.put(channelId, { _tag: 'Candles', candles, sink, generation })

    return { candles, generation }
  })

describe('Commands on a channel with no live handle', () => {
  test('every Command that acts on the feed fails instead of passing silently', async () => {
    const messages = await run(
      Effect.all([
        AddSubscription({ channelId: '1', subscription: quoteAapl }).effect,
        RemoveSubscription({ channelId: '1', subscription: quoteAapl }).effect,
        ClearSubscriptions({ channelId: '1' }).effect,
        ConfigureFeed({ channelId: '1', aggregationPeriod: '', dataFormat: '', rows: [] }).effect,
        SetCandleSubscription({
          channelId: '1',
          generation: 4,
          subscription: { symbol: 'AAPL{=d}', fromTime: 0 },
        }).effect,
      ])
    )

    expect(messages.map((message) => message._tag)).toEqual([
      'FailedAddSubscription',
      'FailedRemoveSubscription',
      'FailedClearSubscriptions',
      'FailedConfigureFeed',
      'FailedSetCandleSubscription',
    ])
    expect(messages[0]).toMatchObject({ error: { type: 'CONSOLE', message: NO_HANDLE } })
    expect(messages[4]).toMatchObject({ generation: 4, error: { message: NO_HANDLE } })
  })
})

describe('Commands on a subscriptions feed', () => {
  test('report what the feed was asked for', async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* putFeed('1')
        const added = yield* AddSubscription({ channelId: '1', subscription: quoteAapl }).effect
        const removed = yield* RemoveSubscription({ channelId: '1', subscription: quoteAapl })
          .effect
        const cleared = yield* ClearSubscriptions({ channelId: '1' }).effect
        const configured = yield* ConfigureFeed({
          channelId: '1',
          aggregationPeriod: '5',
          dataFormat: 'COMPACT',
          rows: [],
        }).effect

        return { added, removed, cleared, configured }
      })
    )

    expect(result.added).toEqual({ _tag: 'SucceededAddSubscription', subscription: quoteAapl })
    expect(result.removed).toEqual({ _tag: 'SucceededRemoveSubscription', key: 'Quote:AAPL' })
    expect(result.cleared).toEqual({ _tag: 'SucceededClearSubscriptions' })
    expect(result.configured).toEqual({ _tag: 'SucceededConfigureFeed' })
  })

  test('an aggregation period that is not a number is a failure, not a NaN on the wire', async () => {
    const message = await run(
      Effect.gen(function* () {
        yield* putFeed('1')

        return yield* ConfigureFeed({
          channelId: '1',
          aggregationPeriod: 'soon',
          dataFormat: '',
          rows: [],
        }).effect
      })
    )

    expect(message).toMatchObject({
      _tag: 'FailedConfigureFeed',
      error: { message: 'Aggregation period "soon" is not a number' },
    })
  })

  test('a candle subscription is refused', async () => {
    const message = await run(
      Effect.gen(function* () {
        yield* putFeed('1')

        return yield* SetCandleSubscription({
          channelId: '1',
          generation: 1,
          subscription: { symbol: 'AAPL{=d}', fromTime: 0 },
        }).effect
      })
    )

    expect(message).toMatchObject({ _tag: 'FailedSetCandleSubscription', generation: 1 })
  })

  test('once the handle is taken, a later Command finds none', async () => {
    const later = await run(
      Effect.gen(function* () {
        const handles = yield* FeedLive
        yield* putFeed('1')
        yield* handles.take('1')

        return yield* AddSubscription({ channelId: '1', subscription: quoteAapl }).effect
      })
    )

    expect(later).toMatchObject({ _tag: 'FailedAddSubscription', error: { message: NO_HANDLE } })
  })
})

describe('Commands on a candle channel', () => {
  test('setting a subscription moves the channel to its generation', async () => {
    const result = await run(
      Effect.gen(function* () {
        const { generation } = yield* putCandles('chart-generation')
        const message = yield* SetCandleSubscription({
          channelId: 'chart-generation',
          generation: 3,
          subscription: { symbol: 'AAPL{=d}', fromTime: 0 },
        }).effect

        return { message, generation: MutableRef.get(generation) }
      })
    )

    expect(result.message).toEqual({ _tag: 'SucceededSetCandleSubscription', generation: 3 })
    expect(result.generation).toBe(3)
  })

  test('feed subscriptions are refused', async () => {
    const message = await run(
      Effect.gen(function* () {
        yield* putCandles('chart-refusal')
        const refused = yield* AddSubscription({
          channelId: 'chart-refusal',
          subscription: quoteAapl,
        }).effect

        return refused
      })
    )

    expect(message).toMatchObject({ _tag: 'FailedAddSubscription' })
  })
})

describe('MountChart', () => {
  test('fails for a channel with no live candle feed, and registers no sink for it', async () => {
    const mount = MountChart({ channelId: 'never-opened' })
    const messages = await Effect.runPromise(
      Stream.runCollect(
        Stream.take(mount.f(document.createElement('div'), Mount.liveViewStateChanges), 1)
      )
    )

    expect(messages).toEqual([
      { _tag: 'FailedMountChart', reason: 'The channel has no live candle feed to draw' },
    ])
    expect(Option.isNone(getSink('never-opened'))).toBe(true)
  })
})
