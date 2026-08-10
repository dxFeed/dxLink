import { DXLinkChannelState, DXLinkFeed, FeedContract, FeedDataFormat } from '@dxfeed/dxlink-api'
import type {
  DXLinkClient,
  FeedAcceptConfig,
  FeedConfig,
  FeedEventData,
  IndexedEventSubscription,
  Subscription,
  TimeSeriesSubscription,
} from '@dxfeed/dxlink-api'
import { createStore } from 'zustand/vanilla'

import type { ViewModel } from '../../shared/view-model'

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

export interface FeedVMState {
  channelState: DXLinkChannelState
  subscriptions: FeedSubscriptionInput[]
  /** Configuration the server reports back (FeedConfig). */
  config: FeedConfig
  events: FeedEventsByType
}

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

// Coalesce window for incoming events before flushing to the store (~10fps).
const FLUSH_INTERVAL_MS = 100

/**
 * ViewModel for one Feed channel (AUTO contract) — wraps a {@link DXLinkFeed}.
 *
 * Construction is PURE: the feed (which opens a channel on construction) is
 * created in {@link start} and released in {@link stop}, NOT in the constructor.
 * This is StrictMode-safe — React double-invokes `useState` initializers, so a
 * side-effectful constructor would open two channels and leak one. The view runs
 * `start()`/`stop()` from a `useEffect` (StrictMode: start→stop→start → one
 * channel). Both are idempotent and re-runnable.
 *
 * Events are coalesced and upserted one-row-per-symbol. Commands: addSubscription /
 * removeSubscription / clearSubscriptions / configure / clearEvents. The channel
 * always uses the default AUTO contract.
 */
export class FeedViewModel implements ViewModel<FeedVMState> {
  readonly store = createStore<FeedVMState>(() => ({
    channelState: DXLinkChannelState.REQUESTED,
    subscriptions: [],
    config: INITIAL_CONFIG,
    events: {},
  }))

  private readonly client: DXLinkClient
  private readonly params: { feed?: string; space?: string }
  private feed: DXLinkFeed<FeedContract.AUTO> | null = null
  private pending: FeedEventData[] = []
  private flushHandle: ReturnType<typeof setTimeout> | null = null

  constructor(client: DXLinkClient, params: { feed?: string; space?: string }) {
    this.client = client
    this.params = params
  }

  /** Open the feed channel and start receiving. Idempotent. */
  start = (): void => {
    if (this.feed !== null) return
    const feed = new DXLinkFeed(this.client, FeedContract.AUTO, {
      feed: this.params.feed,
      space: this.params.space,
    })
    feed.addEventListener(this.handleEvents)
    feed.addConfigChangeListener(this.handleConfig)
    feed.addStateChangeListener(this.handleState)
    this.feed = feed
    // Re-apply any subscriptions already in the store (e.g. after a StrictMode restart).
    const { subscriptions } = this.store.getState()
    if (subscriptions.length > 0) {
      feed.addSubscriptions(subscriptions.map(toProtocol))
    }
    this.store.setState({ channelState: feed.getState() })
  }

  /** Close the feed channel and stop receiving. Idempotent. */
  stop = (): void => {
    const feed = this.feed
    if (feed === null) return
    this.feed = null
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    this.pending = []
    feed.removeEventListener(this.handleEvents)
    feed.removeConfigChangeListener(this.handleConfig)
    feed.removeStateChangeListener(this.handleState)
    feed.close()
  }

  addSubscription = (sub: FeedSubscriptionInput): void => {
    const key = feedSubKey(sub)
    const { subscriptions } = this.store.getState()
    if (subscriptions.some((s) => feedSubKey(s) === key)) return
    this.feed?.addSubscriptions([toProtocol(sub)])
    this.store.setState({ subscriptions: [...subscriptions, sub] })
  }

  removeSubscription = (sub: FeedSubscriptionInput): void => {
    const key = feedSubKey(sub)
    this.feed?.removeSubscriptions([toProtocol(sub)])
    this.store.setState((s) => ({
      subscriptions: s.subscriptions.filter((x) => feedSubKey(x) !== key),
    }))
  }

  clearSubscriptions = (): void => {
    this.feed?.clearSubscriptions()
    this.store.setState({ subscriptions: [] })
  }

  configure = (accept: FeedAcceptConfig): void => {
    this.feed?.configure(accept)
  }

  clearEvents = (): void => {
    this.store.setState({ events: {} })
  }

  /** Closing the feed is terminal (CHANNEL_CANCEL) — same teardown as stop/dispose. */
  close = (): void => {
    this.stop()
  }

  dispose = (): void => {
    this.stop()
  }

  private handleEvents = (events: FeedEventData[]): void => {
    if (this.feed === null) return
    this.pending.push(...events)
    if (this.flushHandle === null) {
      this.flushHandle = setTimeout(this.flush, FLUSH_INTERVAL_MS)
    }
  }

  private flush = (): void => {
    this.flushHandle = null
    if (this.feed === null) return
    const batch = this.pending
    this.pending = []
    if (batch.length === 0) return
    this.store.setState((s) => {
      const events: FeedEventsByType = { ...s.events }
      for (const event of batch) {
        const type = feedEventType(event)
        events[type] = { ...(events[type] ?? {}), [feedEventKey(event)]: event }
      }
      return { events }
    })
  }

  private handleConfig = (config: FeedConfig): void => {
    this.store.setState({ config })
  }

  private handleState = (state: DXLinkChannelState): void => {
    this.store.setState({ channelState: state })
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
