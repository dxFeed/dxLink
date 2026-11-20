import { Array, Option, Schema, pipe } from 'effect'

import type { DepthOfMarketOrder } from '@dxfeed/dxlink-api'

/** One price level. A level the server sent without a usable size keeps its place. */
export const DomOrder = Schema.Struct({
  price: Schema.Finite,
  maybeSize: Schema.Option(Schema.Finite),
})
export type DomOrder = typeof DomOrder.Type

/** A full replacement of the book, as of `time` (Unix milliseconds). */
export const DomSnapshot = Schema.Struct({
  time: Schema.Finite,
  bids: Schema.Array(DomOrder),
  asks: Schema.Array(DomOrder),
})
export type DomSnapshot = typeof DomSnapshot.Type

/** A level without a finite price cannot be placed in the ladder, so it is left out. */
export const toOrders = (orders: ReadonlyArray<DepthOfMarketOrder>): ReadonlyArray<DomOrder> =>
  pipe(
    orders,
    Array.filter((order) => Number.isFinite(order.price)),
    Array.map((order) => ({
      price: order.price,
      maybeSize: Option.liftPredicate(order.size, Number.isFinite),
    }))
  )
