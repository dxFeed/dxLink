/**
 * dxFeed market event types offered in the subscription and event-fields forms.
 *
 * Ported from the legacy dxlink-docs `debug-console/feed-event-type.ts`, preserving
 * its order. This is a convenience list for the UI, not a protocol constraint — the
 * server accepts any event type it knows, so the forms let users type their own.
 *
 * @see https://kb.dxfeed.com/en/data-model/dxfeed-api-market-events.html#event-types
 */
const EVENT_TYPE_LIST = [
  'Quote',
  'Candle',
  'DailyCandle',
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

export type EventType = (typeof EVENT_TYPE_LIST)[number]

/** Widened for use as picker options, where any string is a valid entry. */
export const EVENT_TYPES: readonly string[] = EVENT_TYPE_LIST

/** Documentation for the event-type list, linked from the forms. */
export const EVENT_TYPES_DOC_URL =
  'https://kb.dxfeed.com/en/data-model/dxfeed-api-market-events.html#event-types'
