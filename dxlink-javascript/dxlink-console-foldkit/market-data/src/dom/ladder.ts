import { Array, Option, Order, pipe } from 'effect'

/** One price level of one side of the book. */
export type LadderOrder = Readonly<{ price: number; maybeSize: Option.Option<number> }>

/**
 * One row of the combined ladder: the bid and the ask of the same rank.
 *
 * `level` is the row's rank from the spread, starting at 1. It is the row's identity — a
 * ladder row is "the third best level", whichever prices happen to occupy it.
 */
export type LadderRow = Readonly<{
  level: number
  maybeBid: Option.Option<LadderOrder>
  maybeAsk: Option.Option<LadderOrder>
}>

/** Split a comma- or space-separated list into entries, dropping blanks. */
export const parseList = (raw: string): ReadonlyArray<string> =>
  pipe(
    raw.split(/[\s,]+/),
    Array.map((entry) => entry.trim()),
    Array.filter((entry) => entry !== '')
  )

/** A price or size for display; anything that is not a finite number reads as a dash. */
export const formatNumber = (value: number): string =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'

/**
 * A numeric draft as the protocol wants it: `None` for a blank field, which means "server
 * default", and for text that is not a number.
 */
export const parseOptionalNumber = (draft: string): Option.Option<number> =>
  pipe(
    Option.liftPredicate(draft.trim(), (text) => text !== ''),
    Option.map(Number),
    Option.filter(Number.isFinite)
  )

const byPriceAscending = Order.mapInput(Order.Number, (order: LadderOrder) => order.price)

/**
 * The combined ladder: best levels first, the highest bid beside the lowest ask. The shorter
 * side simply runs out.
 */
export const toLadderRows = (
  bids: ReadonlyArray<LadderOrder>,
  asks: ReadonlyArray<LadderOrder>
): ReadonlyArray<LadderRow> => {
  const sortedBids = Array.sort(bids, Order.flip(byPriceAscending))
  const sortedAsks = Array.sort(asks, byPriceAscending)

  const levels = Math.max(sortedBids.length, sortedAsks.length)

  // NOTE: `Array.makeBy` never returns an empty array, so an empty book is its own case.
  return levels === 0
    ? []
    : Array.makeBy(levels, (index) => ({
        level: index + 1,
        maybeBid: Array.get(sortedBids, index),
        maybeAsk: Array.get(sortedAsks, index),
      }))
}
