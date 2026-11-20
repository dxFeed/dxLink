import { Array, Option, Order, pipe } from 'effect'

/** One price level of one side of the book. */
export type LadderOrder = Readonly<{ price: number; maybeSize: Option.Option<number> }>

/**
 * One price level as the ladder renders it.
 *
 * `key` is the level's identity within its side of the book: its price, which stays the same
 * while the level's size changes and while levels around it come and go. Levels a server
 * repeats at one price are told apart by their order among themselves.
 */
export type LadderLevel = Readonly<{
  key: string
  price: number
  maybeSize: Option.Option<number>
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

const toLevels = (sorted: ReadonlyArray<LadderOrder>): ReadonlyArray<LadderLevel> =>
  Array.match(sorted, {
    onEmpty: () => [],
    onNonEmpty: (orders) =>
      pipe(
        orders,
        Array.groupWith((left, right) => left.price === right.price),
        Array.flatMap((samePrice) =>
          Array.map(samePrice, (order, occurrence) => ({
            key: occurrence === 0 ? `${order.price}` : `${order.price}#${occurrence}`,
            price: order.price,
            maybeSize: order.maybeSize,
          }))
        )
      ),
  })

/** The bid side of the ladder, best level first: the highest price on top. */
export const toBidLevels = (bids: ReadonlyArray<LadderOrder>): ReadonlyArray<LadderLevel> =>
  toLevels(Array.sort(bids, Order.flip(byPriceAscending)))

/** The ask side of the ladder, best level first: the lowest price on top. */
export const toAskLevels = (asks: ReadonlyArray<LadderOrder>): ReadonlyArray<LadderLevel> =>
  toLevels(Array.sort(asks, byPriceAscending))
