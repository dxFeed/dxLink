/**
 * dxFeed market event types offered in the subscription and event-fields forms.
 *
 * Ported from the legacy dxlink-docs `debug-console/feed-event-type.ts`, preserving
 * its order. This is a convenience list for the UI, not a protocol constraint — the
 * server accepts any event type it knows, so the forms let users type their own.
 *
 * Deprecated event types are left off. `DailyCandle` is the one this list carried: the
 * dxFeed API deprecates it in favour of `Candle`, whose daily aggregation now carries the
 * properties `DailyCandle` existed for. A server that still serves it can still be asked for
 * it — the field is free text — but offering it here would recommend it.
 *
 * @see https://kb.dxfeed.com/en/data-model/dxfeed-api-market-events.html#event-types
 */
const EVENT_TYPE_LIST = [
  'Quote',
  'Candle',
  'Trade',
  'TradeETH',
  'Summary',
  'Profile',
  'Greeks',
  'TheoPrice',
  'TimeAndSale',
  'Underlying',
  'AnalyticOrder',
  'SpreadOrder',
  'OptionSale',
  'Order',
  'Series',
  'Configuration',
  'Message',
] as const

/** Widened for use as picker options, where any string is a valid entry. */
export const EVENT_TYPES: readonly string[] = EVENT_TYPE_LIST

/** Documentation for the event-type list, linked from the forms. */
export const EVENT_TYPES_DOC_URL =
  'https://kb.dxfeed.com/en/data-model/dxfeed-api-market-events.html#event-types'
