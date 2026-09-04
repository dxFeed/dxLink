import { DXLinkFeed, FeedContract, FeedDataFormat } from '@dxfeed/dxlink-api'
import type { DXLinkClient, DXLinkLogLevel, FeedEventData } from '@dxfeed/dxlink-api'

import { SortedList } from './sorted-list'

/**
 * Indexed-event flags bitmask. Ported verbatim from the legacy dxlink-docs
 * `candles/candles.ts`.
 */
export enum EventFlags {
  TxPending = 0x01,
  RemoveEvent = 0x02,
  SnapshotBegin = 0x04,
  SnapshotEnd = 0x08,
  SnapshotSnip = 0x10,
}

export interface DXLinkCandleSubscription {
  readonly symbol: string
  readonly fromTime: number
}

export type DXLinkCandleData = {
  isSnapshot: boolean
  events: ReadonlyArray<Readonly<DXLinkCandleEvent>>
}

export interface IndexedEvent {
  eventSymbol: string
  eventFlags: EventFlags
  index: number
}

export interface TimeSeriesEvent extends IndexedEvent {
  time: number
}

export interface DXLinkCandleEvent extends TimeSeriesEvent {
  eventType: 'Candle'
  open: number | 'NaN'
  high: number | 'NaN'
  low: number | 'NaN'
  close: number | 'NaN'
  volume: number | 'NaN'
  [key: string]: number | string
}

const isCandleEvent = (event: FeedEventData): event is DXLinkCandleEvent =>
  event.eventType === 'Candle'

const parseEventFlags = (event: IndexedEvent) => ({
  txPending: (event.eventFlags & EventFlags.TxPending) > 0,
  shouldBeRemoved: (event.eventFlags & EventFlags.RemoveEvent) > 0,
  snapshotBegin: (event.eventFlags & EventFlags.SnapshotBegin) > 0,
  snapshotEnd: (event.eventFlags & EventFlags.SnapshotEnd) > 0,
  snapshotSnip: (event.eventFlags & EventFlags.SnapshotSnip) > 0,
})

export interface DXLinkCandlesOptions {
  logLevel: DXLinkLogLevel
  /** Feed qualification, forwarded to the underlying HISTORY feed. */
  feed?: string
  /** Feed space, forwarded to the underlying HISTORY feed. */
  space?: string
}

/**
 * Candle aggregator over a HISTORY feed. Ported from the legacy dxlink-docs
 * `candles/candles.ts`: configures the feed for COMPACT Candle events, tracks
 * snapshot/transaction flags, and maintains an index-sorted candle list.
 */
export class DXLinkCandles {
  private readonly feed: DXLinkFeed<FeedContract.HISTORY>

  private isPartialSnapshot = false
  private isCompleteSnapshot = false

  private pQueue: DXLinkCandleEvent[] = []
  private events = new SortedList<DXLinkCandleEvent>((a, b) => a.index - b.index)

  private listeners = new Set<(data: DXLinkCandleData) => void>()

  constructor(client: DXLinkClient, options?: Partial<DXLinkCandlesOptions>) {
    this.feed = new DXLinkFeed(client, FeedContract.HISTORY, options)

    this.feed.configure({
      acceptDataFormat: FeedDataFormat.COMPACT,
      acceptEventFields: {
        Candle: [
          'eventType',
          'eventSymbol',
          'eventFlags',
          'index',
          'time',
          'open',
          'high',
          'low',
          'close',
          'volume',
        ],
      },
    })

    this.feed.addEventListener((events) => {
      for (const event of events) {
        if (isCandleEvent(event)) {
          this.processEvent(event)
        }
      }
    })
  }

  get id() {
    return this.feed.id
  }

  getChannel = () => this.feed.getChannel()

  setSubscription = (subscription: DXLinkCandleSubscription) => {
    this.feed.clearSubscriptions()
    this.feed.addSubscriptions({ type: 'Candle', ...subscription })
  }

  addListener(listener: (snapshot: DXLinkCandleData) => void) {
    this.listeners.add(listener)
  }

  removeListener(listener: (snapshot: DXLinkCandleData) => void) {
    this.listeners.delete(listener)
  }

  private processEvent = (event: DXLinkCandleEvent) => {
    const eventFlags = parseEventFlags(event)
    if (eventFlags.snapshotBegin) {
      this.pQueue = []
      this.isPartialSnapshot = true
      this.isCompleteSnapshot = false
    }

    if (this.isPartialSnapshot && (eventFlags.snapshotEnd || eventFlags.snapshotSnip)) {
      this.isPartialSnapshot = false
      this.isCompleteSnapshot = true
    }

    this.pQueue.push(event)

    if (eventFlags.txPending || this.isPartialSnapshot) {
      return
    }

    const isCompleteSnapshot = this.isCompleteSnapshot
    if (this.isCompleteSnapshot) {
      this.isCompleteSnapshot = false
      this.events.clear()
    }

    let hasChanged = false
    for (let next = this.pQueue.shift(); next !== undefined; next = this.pQueue.shift()) {
      const { shouldBeRemoved } = parseEventFlags(next)
      if (shouldBeRemoved) {
        if (!this.events.remove(next)) {
          continue
        }
      } else {
        this.events.insert(next)
      }
      hasChanged = true
    }

    if (hasChanged) {
      for (const listener of this.listeners) {
        listener({ isSnapshot: isCompleteSnapshot, events: this.events.toArray() })
      }
    }
  }

  close() {
    this.feed.close()
  }
}
