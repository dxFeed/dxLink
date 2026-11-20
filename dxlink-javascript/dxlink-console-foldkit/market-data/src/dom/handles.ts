import { Context, Layer, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

import { DXLinkChannelState, type DXLinkDepthOfMarket } from '@dxfeed/dxlink-api'
import {
  type ChannelHandles,
  type DxLinkClientService,
  makeChannelHandles,
} from '@dxfeed/dxlink-console-foldkit-core'

export const ChannelState = Schema.Enum(DXLinkChannelState)

export const DomOrder = Schema.Struct({
  price: Schema.Number,
  size: Schema.Number,
})
export type DomOrder = typeof DomOrder.Type

/** A full replacement of the book, as of `time` (Unix milliseconds). */
export const DomSnapshot = Schema.Struct({
  time: Schema.Number,
  bids: Schema.Array(DomOrder),
  asks: Schema.Array(DomOrder),
})
export type DomSnapshot = typeof DomSnapshot.Type

/**
 * The configuration the server applied. The two numbers are absent until the server has
 * answered — before that the client holds no value for them.
 */
export const AppliedConfig = Schema.Struct({
  maybeAggregationPeriod: Schema.Option(Schema.Number),
  maybeDepthLimit: Schema.Option(Schema.Number),
  dataFormat: Schema.String,
  orderFields: Schema.Array(Schema.String),
})
export type AppliedConfig = typeof AppliedConfig.Type

/** What a live DOM channel reports through its listeners, before it becomes a Message. */
export const DomEvent = defineTaggedUnion({
  Snapshot: { snapshot: DomSnapshot },
  ChangedState: { channelState: ChannelState },
  ChangedConfig: { applied: AppliedConfig },
  Failed: { type: Schema.String, message: Schema.String },
})
export type DomEvent = typeof DomEvent.Type

/** A live DOM channel and the way to stop listening to it. */
export type DomHandle = Readonly<{
  dom: DXLinkDepthOfMarket
  detach: () => void
}>

/** The live DOM channels of the console, keyed by the id of their card. */
export class DomHandles extends Context.Service<DomHandles, ChannelHandles<DomHandle, DomEvent>>()(
  'DomHandles'
) {}

/** Provides {@link DomHandles}; belongs in the runtime's `resources`. */
export const domLayer = Layer.effect(DomHandles, makeChannelHandles<DomHandle, DomEvent>())

/** Everything a DOM Command or the DOM event Stream requires. */
export type DomServices = DomHandles | DxLinkClientService
