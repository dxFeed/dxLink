import { Context, Effect, Layer, type MutableRef } from 'effect'

import type {
  DXLinkChannelState,
  DXLinkFeed,
  FeedConfig,
  FeedContract,
  FeedEventData,
} from '@dxfeed/dxlink-api'
import {
  type ChannelHandles,
  type DxLinkClientService,
  makeChannelHandles,
} from '@dxfeed/dxlink-console-foldkit-core'

import { type CandleChartSink, unregisterAllSinks } from './candleChart'
import type { DXLinkCandles } from './candles'

/**
 * The live objects behind one FEED channel card.
 *
 * A candle channel holds, beside its aggregator, the sink its candles are drawn into and the
 * generation of the subscription it is serving, which its reports are stamped with.
 */
export type FeedHandle =
  | Readonly<{ _tag: 'Feed'; feed: DXLinkFeed<FeedContract.AUTO> }>
  | Readonly<{
      _tag: 'Candles'
      candles: DXLinkCandles
      sink: CandleChartSink
      generation: MutableRef.MutableRef<number>
    }>

/**
 * What a live FEED channel reports, as its listeners see it. Signals become Messages in the
 * plugin's event Stream, which is where event batches are coalesced and errors are stamped.
 */
export type FeedSignal =
  | Readonly<{ _tag: 'Events'; events: ReadonlyArray<FeedEventData> }>
  | Readonly<{ _tag: 'Config'; config: FeedConfig }>
  | Readonly<{ _tag: 'State'; state: DXLinkChannelState }>
  | Readonly<{ _tag: 'Error'; type: string; message: string }>
  | Readonly<{ _tag: 'Candles'; generation: number; count: number }>
  | Readonly<{ _tag: 'ChartFailure'; generation: number; reason: string }>

/** Everything live behind the FEED plugin's channels; lives as long as the runtime. */
export class FeedLive extends Context.Service<FeedLive, ChannelHandles<FeedHandle, FeedSignal>>()(
  'dxlink/FeedLive'
) {}

/** Releasing the layer drops every chart sink the Mounts could still look up. */
export const feedLayer: Layer.Layer<FeedLive> = Layer.effect(
  FeedLive,
  Effect.gen(function* () {
    const handles = yield* makeChannelHandles<FeedHandle, FeedSignal>()
    yield* Effect.addFinalizer(() => Effect.sync(unregisterAllSinks))

    return handles
  })
)

/** What the FEED plugin's Commands and event Stream require. */
export type FeedServices = FeedLive | DxLinkClientService
