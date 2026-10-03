import { DXLinkFeed, DXLinkLogLevel, FeedContract, FeedDataFormat } from '@dxfeed/dxlink-api'
import type {
  DXLinkClient,
  FeedAcceptConfig,
  FeedConfig,
  FeedEventData,
  IndexedEventSubscription,
  Subscription,
  TimeSeriesSubscription,
} from '@dxfeed/dxlink-api'
import { channelSession, command, makeChannelAtoms, on, onBatch } from '@dxfeed/dxlink-console-core'
import type { ChannelAtoms, Session } from '@dxfeed/dxlink-console-core'
import { Effect } from 'effect'
import * as Atom from 'effect/reactivity/Atom'

export type FeedSubKind = 'regular' | 'indexed' | 'timeSeries'

/** A subscription as entered in the form (UI shape, before protocol conversion). */
export interface FeedSubscriptionInput {
  type: string
  symbol: string
  kind: FeedSubKind
  source?: string
  fromTime?: number
}

/** Dedup key, mirroring the feed's getSubscriptionKey: `type[#source]:symbol`. */
export const feedSubKey = (s: FeedSubscriptionInput): string =>
  `${s.type}${s.kind === 'indexed' && s.source ? `#${s.source}` : ''}:${s.symbol}`

/** Received events grouped by event type, then keyed by symbol (one row per symbol). */
export type FeedEventsByType = Record<string, Record<string, FeedEventData>>

const INITIAL_CONFIG: FeedConfig = {
  aggregationPeriod: NaN,
  dataFormat: FeedDataFormat.FULL,
  eventFields: {},
}

const UNKNOWN = '(unknown)'

/**
 * Row key for a received event: the symbol, suffixed with `#source` when the event
 * carries one.
 *
 * The suffix matters. `Order`-family events are published per order source, so the
 * same symbol legitimately arrives from several sources at once (`AAPL` from `NTV`
 * and from `DEX`). Keying on the symbol alone would make those overwrite each other
 * and show one row where there should be several.
 */
export const feedEventKey = (event: FeedEventData): string => {
  const symbol =
    event.eventSymbol !== undefined && event.eventSymbol !== null
      ? String(event.eventSymbol)
      : UNKNOWN
  const source = 'source' in event && event.source != null ? String(event.source) : ''

  return source !== '' ? `${symbol}#${source}` : symbol
}

/** Group key for a received event: its type, or the unknown bucket. */
export const feedEventType = (event: FeedEventData): string =>
  typeof event.eventType === 'string' && event.eventType !== '' ? event.eventType : UNKNOWN

/**
 * Merge a batch of received events into the table, one row per {@link feedEventKey} within each
 * {@link feedEventType}.
 *
 * Each event type touched is copied once per batch rather than once per event: a busy feed
 * delivers thousands of events per flush, nearly all for the same few types.
 */
export const upsertFeedEvents = (
  current: FeedEventsByType,
  batch: readonly FeedEventData[]
): FeedEventsByType => {
  const touched = new Map<string, Record<string, FeedEventData>>()
  for (const event of batch) {
    const type = feedEventType(event)
    let rows = touched.get(type)
    if (rows === undefined) {
      rows = { ...current[type] }
      touched.set(type, rows)
    }
    rows[feedEventKey(event)] = event
  }

  return touched.size === 0 ? current : { ...current, ...Object.fromEntries(touched) }
}

/** One Feed channel (AUTO contract) — wraps a {@link DXLinkFeed}. */
export interface FeedModel {
  readonly channel: ChannelAtoms
  readonly session: Session<DXLinkFeed<FeedContract.AUTO> | null>
  readonly subscriptions: Atom.Atom<readonly FeedSubscriptionInput[]>
  /** Configuration the server reports back. */
  readonly config: Atom.Atom<FeedConfig>
  readonly events: Atom.Atom<FeedEventsByType>

  readonly addSubscription: Atom.Writable<void, FeedSubscriptionInput>
  readonly removeSubscription: Atom.Writable<void, FeedSubscriptionInput>
  readonly clearSubscriptions: Atom.Writable<void>
  readonly configure: Atom.Writable<void, FeedAcceptConfig>
  readonly clearEvents: Atom.Writable<void>
}

/**
 * The model for one Feed channel. The channel always uses the default AUTO contract.
 *
 * Events are coalesced into flush windows (see `onBatch`) and upserted one row per symbol.
 */
export const makeFeedModel = (
  client: DXLinkClient,
  params: { feed?: string; space?: string }
): FeedModel => {
  const channel = makeChannelAtoms()
  const subscriptions = Atom.make<readonly FeedSubscriptionInput[]>([])
  const config = Atom.make<FeedConfig>(INITIAL_CONFIG)
  const events = Atom.make<FeedEventsByType>({})

  const feedSession = channelSession(channel, {
    state: [subscriptions, config, events],
    open: () =>
      new DXLinkFeed(client, FeedContract.AUTO, {
        feed: params.feed,
        space: params.space,
        // A debug console wants the protocol traffic in the browser log.
        logLevel: DXLinkLogLevel.DEBUG,
      }),
    // Closing the feed is terminal (CHANNEL_CANCEL).
    close: (feed) => feed.close(),
    channel: (feed) => feed.getChannel(),
    wire: (feed, registry) =>
      Effect.gen(function* () {
        yield* on(feed, 'ConfigChange', (next) => registry.set(config, next))

        yield* onBatch(feed, 'Event', (batch) =>
          Atom.update(events, (current) =>
            upsertFeedEvents(
              current,
              batch.flatMap(([received]) => received)
            )
          )
        )

        // Subscriptions added while no channel was open still belong on the wire.
        const pending = registry.get(subscriptions)
        if (pending.length > 0) {
          feed.addSubscriptions(pending.map(toProtocol))
        }
      }),
  })

  return {
    channel,
    session: feedSession,
    subscriptions,
    config,
    events,

    addSubscription: command((ctx, subscription: FeedSubscriptionInput) => {
      const key = feedSubKey(subscription)
      const current = ctx.get(subscriptions)
      if (current.some((s) => feedSubKey(s) === key)) return
      feedSession.current()?.addSubscriptions([toProtocol(subscription)])
      ctx.set(subscriptions, [...current, subscription])
    }),
    removeSubscription: command((ctx, subscription: FeedSubscriptionInput) => {
      const key = feedSubKey(subscription)
      feedSession.current()?.removeSubscriptions([toProtocol(subscription)])
      ctx.set(
        subscriptions,
        ctx.get(subscriptions).filter((s) => feedSubKey(s) !== key)
      )
    }),
    clearSubscriptions: command((ctx) => {
      feedSession.current()?.clearSubscriptions()
      ctx.set(subscriptions, [])
    }),
    configure: command((_ctx, accept: FeedAcceptConfig) => {
      feedSession.current()?.configure(accept)
    }),
    clearEvents: command((ctx) => ctx.set(events, {})),
  }
}

const toProtocol = (
  s: FeedSubscriptionInput
): Subscription | IndexedEventSubscription | TimeSeriesSubscription => {
  if (s.kind === 'indexed') {
    return { type: s.type, symbol: s.symbol, source: s.source ?? '' }
  }
  if (s.kind === 'timeSeries') {
    return { type: s.type, symbol: s.symbol, fromTime: s.fromTime ?? 0 }
  }
  return { type: s.type, symbol: s.symbol }
}
