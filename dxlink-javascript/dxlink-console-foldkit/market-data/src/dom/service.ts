import { Context, Layer } from 'effect'

import type { DXLinkDepthOfMarket } from '@dxfeed/dxlink-api'
import {
  type ChannelHandles,
  type DxLinkClientService,
  makeChannelHandles,
} from '@dxfeed/dxlink-console-foldkit-core'

/** A live DOM channel and the way to stop listening to it. */
export type DomHandle = Readonly<{
  dom: DXLinkDepthOfMarket
  detach: () => void
}>

/** The live DOM channels of the console, keyed by the id of their card. */
export class DomHandles extends Context.Service<DomHandles, ChannelHandles<DomHandle>>()(
  'DomHandles'
) {}

/** Provides {@link DomHandles}; belongs in the runtime's `resources`. */
export const domLayer = Layer.effect(DomHandles, makeChannelHandles<DomHandle>())

/** Everything a DOM Command or the live side of a DOM channel requires. */
export type DomServices = DomHandles | DxLinkClientService
