/**
 * Predefined order sources for indexed `Order`-family subscriptions.
 *
 * Ported verbatim from the legacy dxlink-docs `debug-console/feed-order-source.ts`,
 * preserving its order. Case matters: the lowercase entries (`ntv`, `iex`, `glbx`, …)
 * are distinct sources from their uppercase counterparts, not duplicates.
 *
 * Offered as suggestions only — the forms accept free text so a source that is not
 * on this list can still be used.
 *
 * @see https://kb.dxfeed.com/en/data-model/qd-model-of-market-events.html#order-x
 */
const FEED_ORDER_SOURCE_LIST = [
  'ABE',
  'BATE',
  'BI20',
  'BXTR',
  'BYX',
  'BZX',
  'C2OX',
  'CEUX',
  'CFE',
  'CHIX',
  'DEA',
  'DEX',
  'ERIS',
  'ESPD',
  'FAIR',
  'GLBX',
  'ICE',
  'ISE',
  'IST',
  'MEMX',
  'NFX',
  'NTV',
  'SMFE',
  'XEUR',
  'XNFI',
  'glbx',
  'iex',
  'memx',
  'ntv',
  'smfe',
  'xeu',
  'AGGREGATE_ASK',
  'AGGREGATE_BID',
  'DEFAULT',
] as const

export type FeedOrderSource = (typeof FEED_ORDER_SOURCE_LIST)[number]

/** Widened for use as picker options, where any string is a valid entry. */
export const FEED_ORDER_SOURCES: readonly string[] = FEED_ORDER_SOURCE_LIST

/** Documentation for order sources, linked from the subscription form. */
export const ORDER_SOURCES_DOC_URL =
  'https://kb.dxfeed.com/en/data-model/qd-model-of-market-events.html#order-x'

/** Candle symbol format reference, linked from the candle subscription forms. */
export const CANDLE_SYMBOLS_DOC_URL =
  'https://kb.dxfeed.com/en/data-access/rest-api.html#candle-symbols'

/** Unix-milliseconds helper, linked from every `fromTime` field. */
export const EPOCH_MILLIS_DOC_URL = 'https://currentmillis.com/'
