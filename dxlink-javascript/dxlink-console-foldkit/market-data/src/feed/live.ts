import { Context, Layer } from 'effect'

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

import type { DXLinkCandles } from './candles'

/** The live dxLink object behind one FEED channel card. */
export type FeedHandle =
  | Readonly<{ _tag: 'Feed'; feed: DXLinkFeed<FeedContract.AUTO> }>
  | Readonly<{ _tag: 'Candles'; candles: DXLinkCandles }>

/**
 * What a live FEED channel reports, as its listeners see it. Signals become Messages in the
 * plugin's event Stream, which is where event batches are coalesced and errors are stamped.
 */
export type FeedSignal =
  | Readonly<{ _tag: 'Events'; events: ReadonlyArray<FeedEventData> }>
  | Readonly<{ _tag: 'Config'; config: FeedConfig }>
  | Readonly<{ _tag: 'State'; state: DXLinkChannelState }>
  | Readonly<{ _tag: 'Error'; type: string; message: string }>
  | Readonly<{ _tag: 'Candles'; count: number }>
  | Readonly<{ _tag: 'ChartFailure'; reason: string }>

/** Everything live behind the FEED plugin's channels; lives as long as the runtime. */
export class FeedLive extends Context.Service<FeedLive, ChannelHandles<FeedHandle, FeedSignal>>()(
  'dxlink/FeedLive'
) {}

export const feedLayer: Layer.Layer<FeedLive> = Layer.effect(
  FeedLive,
  makeChannelHandles<FeedHandle, FeedSignal>()
)

/** What the FEED plugin's Commands and event Stream require. */
export type FeedServices = FeedLive | DxLinkClientService
