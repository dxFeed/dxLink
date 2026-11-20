import { Array, Option, Order, Predicate, Record, Schema, String, pipe } from 'effect'

import type {
  FeedEventFields,
  IndexedEventSubscription,
  Subscription,
  TimeSeriesSubscription,
} from '@dxfeed/dxlink-api'

export const FeedView = Schema.Literals(['Subscriptions', 'Chart'])
export type FeedView = typeof FeedView.Type

/** Config a FEED channel is opened with. */
export type FeedConfig = Readonly<{
  view: FeedView
  /** Feed qualification — omitted from the protocol when empty. */
  feed: string
  /** Feed space — omitted from the protocol when empty. */
  space: string
}>

export const SubscriptionKind = Schema.Literals(['Regular', 'Indexed', 'TimeSeries'])
export type SubscriptionKind = typeof SubscriptionKind.Type

/**
 * A subscription as entered in the form.
 *
 * `source` is read only for `Indexed` and `fromTime` only for `TimeSeries`; the other kinds
 * carry the neutral value.
 */
export const FeedSubscription = Schema.Struct({
  kind: SubscriptionKind,
  type: Schema.String,
  symbol: Schema.String,
  source: Schema.String,
  fromTime: Schema.Finite,
})
export type FeedSubscription = typeof FeedSubscription.Type

const hasSource = (subscription: FeedSubscription): boolean =>
  subscription.kind === 'Indexed' && subscription.source !== ''

/** Dedup key, mirroring the feed's own subscription key: `type[#source]:symbol`. */
export const subscriptionKey = (subscription: FeedSubscription): string =>
  `${subscription.type}${hasSource(subscription) ? `#${subscription.source}` : ''}:${subscription.symbol}`

/** Human label for a subscription chip. */
export const subscriptionLabel = (subscription: FeedSubscription): string =>
  subscription.kind === 'TimeSeries'
    ? `${subscriptionKey(subscription)} · from ${subscription.fromTime}`
    : subscriptionKey(subscription)

export const toProtocolSubscription = (
  subscription: FeedSubscription
): Subscription | IndexedEventSubscription | TimeSeriesSubscription => {
  const { type, symbol } = subscription
  if (subscription.kind === 'Indexed') {
    return { type, symbol, source: subscription.source }
  }
  if (subscription.kind === 'TimeSeries') {
    return { type, symbol, fromTime: subscription.fromTime }
  }

  return { type, symbol }
}

/** One received event: a flat record of protocol fields. */
export const FeedEvent = Schema.Record(Schema.String, Schema.Unknown)
export type FeedEvent = typeof FeedEvent.Type

/** Received events grouped by event type, then keyed by row (see {@link eventKey}). */
export const EventsByType = Schema.Record(Schema.String, Schema.Record(Schema.String, FeedEvent))
export type EventsByType = typeof EventsByType.Type

/**
 * A received event as the Model holds it: plain JSON only.
 *
 * Absent fields are dropped and non-finite numbers become the names the protocol itself uses
 * for them, so a Model full of events can always be serialized.
 */
export const toFeedEvent = (event: Readonly<Record<string, unknown>>): FeedEvent =>
  pipe(
    event,
    Record.filter(Predicate.isNotUndefined),
    Record.map((value) =>
      Predicate.isNumber(value) && !Number.isFinite(value) ? globalThis.String(value) : value
    )
  )

const UNKNOWN = '(unknown)'

/**
 * Row key for a received event: the symbol, suffixed with `#source` when the event carries
 * one.
 *
 * The suffix matters. `Order`-family events are published per order source, so the same
 * symbol legitimately arrives from several sources at once (`AAPL` from `NTV` and from
 * `DEX`). Keying on the symbol alone would make those overwrite each other and show one row
 * where there should be several.
 */
export const eventKey = (event: FeedEvent): string => {
  const symbol = Predicate.isNullish(event['eventSymbol'])
    ? UNKNOWN
    : globalThis.String(event['eventSymbol'])
  const source = Predicate.isNullish(event['source']) ? '' : globalThis.String(event['source'])

  return source === '' ? symbol : `${symbol}#${source}`
}

/** Group key for a received event: its type, or the unknown bucket. */
export const eventType = (event: FeedEvent): string => {
  const type = event['eventType']

  return Predicate.isString(type) && type !== '' ? type : UNKNOWN
}

/** Upsert a batch: one row per {@link eventKey} within each event type, the latest winning. */
export const upsertEvents = (events: EventsByType, batch: ReadonlyArray<FeedEvent>): EventsByType =>
  Array.reduce(batch, events, (accumulated, event) => {
    const type = eventType(event)

    return Record.set(
      accumulated,
      type,
      Record.set(
        Option.getOrElse(Record.get(accumulated, type), () => ({})),
        eventKey(event),
        event
      )
    )
  })

/** Columns shown first when present, while the server has reported no field order. */
const PRIORITY_FIELDS = ['eventSymbol', 'eventType']

/**
 * Column order for one event type.
 *
 * Prefers the field order the server negotiated for this event type — in a protocol debug
 * console the order the protocol actually agreed on is information, not noise, so it is not
 * re-sorted. `eventSymbol` is hoisted to the front to keep the row identity leftmost. Fields
 * present on rows but absent from the negotiated list are appended alphabetically, so nothing
 * received is ever hidden.
 *
 * Without a negotiated order — before the first config arrives, or for the unknown-event
 * bucket — priority fields come first and the rest follow alphabetically.
 */
export const buildColumns = (
  rows: ReadonlyArray<FeedEvent>,
  negotiated: ReadonlyArray<string>
): ReadonlyArray<string> => {
  const keys = pipe(rows, Array.flatMap(Record.keys), Array.dedupe)

  return Array.match(negotiated, {
    onEmpty: () => [
      ...Array.filter(PRIORITY_FIELDS, (key) => Array.contains(keys, key)),
      ...pipe(
        keys,
        Array.filter((key) => !Array.contains(PRIORITY_FIELDS, key)),
        Array.sort(Order.String)
      ),
    ],
    onNonEmpty: (fields) => {
      const inOrder = [
        ...Array.filter(fields, (field) => field === 'eventSymbol'),
        ...Array.filter(fields, (field) => field !== 'eventSymbol'),
      ]

      return [
        ...inOrder,
        ...pipe(
          keys,
          Array.filter((key) => !Array.contains(inOrder, key)),
          Array.sort(Order.String)
        ),
      ]
    },
  })
}

/** One row of the accept-event-fields editor. `id` is its identity in the keyed list. */
export const EventFieldRow = Schema.Struct({
  id: Schema.Finite,
  type: Schema.String,
  fields: Schema.String,
})
export type EventFieldRow = typeof EventFieldRow.Type

const parseFields = (fields: string): ReadonlyArray<string> =>
  pipe(fields, String.split(','), Array.map(String.trim), Array.filter(String.isNonEmpty))

/**
 * Build `acceptEventFields` from the editor rows. `eventType` and `eventSymbol` always lead:
 * the console cannot place an event without them. Rows with no event type are skipped, and
 * `None` means the request carries no field list at all.
 */
export const buildAcceptEventFields = (
  rows: ReadonlyArray<EventFieldRow>
): Option.Option<FeedEventFields> => {
  const entries = pipe(
    rows,
    Array.filter((row) => row.type.trim() !== ''),
    Array.map((row): readonly [string, Array<string>] => [
      row.type.trim(),
      Array.dedupe(['eventType', 'eventSymbol', ...parseFields(row.fields)]),
    ])
  )

  return Array.isArrayNonEmpty(entries)
    ? Option.some(globalThis.Object.fromEntries(entries))
    : Option.none()
}

/** Render one cell: protocol values are shown as sent, objects as JSON. */
export const formatCell = (value: unknown): string => {
  if (Predicate.isNullish(value)) {
    return ''
  }

  return Predicate.isObject(value) ? JSON.stringify(value) : globalThis.String(value)
}
