import { Context, Layer, type MutableRef } from 'effect'

import type { DXLinkFeed, FeedContract } from '@dxfeed/dxlink-api'
import {
  type ChannelHandles,
  type DxLinkClientService,
  makeChannelHandles,
} from '@dxfeed/dxlink-console-foldkit-core'

import type { Candles } from '../domain'
import type { CandleChartSink } from './chartSink'

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
      candles: Candles.DXLinkCandles
      sink: CandleChartSink
      generation: MutableRef.MutableRef<number>
    }>

/**
 * The handles of the connected FEED channels, by the id of their card. Lives as long as the
 * runtime; a handle is in it exactly while its channel is connected.
 */
export class FeedLive extends Context.Service<FeedLive, ChannelHandles<FeedHandle>>()(
  'dxlink/FeedLive'
) {}

export const feedLayer: Layer.Layer<FeedLive> = Layer.effect(
  FeedLive,
  makeChannelHandles<FeedHandle>()
)

/** What the FEED plugin's Commands and live channels require. */
export type FeedServices = FeedLive | DxLinkClientService
