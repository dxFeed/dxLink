import { DXLinkFeed, FeedContract, FeedDataFormat } from '@dxfeed/dxlink-api'
import type { DXLinkClient, DXLinkLogLevel, FeedEventData } from '@dxfeed/dxlink-api'

import { SortedList } from './sortedList'

/** Indexed-event flags bitmask. */
export const EVENT_FLAGS = {
  TX_PENDING: 0x01,
  REMOVE_EVENT: 0x02,
  SNAPSHOT_BEGIN: 0x04,
  SNAPSHOT_END: 0x08,
  SNAPSHOT_SNIP: 0x10,
}

export type DXLinkCandleSubscription = Readonly<{
  symbol: string
  fromTime: number
}>

export type DXLinkCandleEvent = {
  eventType: 'Candle'
  eventSymbol: string
  eventFlags: number
  index: number
  time: number
  open: number | 'NaN'
  high: number | 'NaN'
  low: number | 'NaN'
  close: number | 'NaN'
  volume: number | 'NaN'
  [key: string]: number | string
}

export type DXLinkCandleData = Readonly<{
  isSnapshot: boolean
  events: ReadonlyArray<Readonly<DXLinkCandleEvent>>
}>

const isCandleEvent = (event: FeedEventData): event is DXLinkCandleEvent =>
  event.eventType === 'Candle'

const parseEventFlags = (event: DXLinkCandleEvent) => ({
  txPending: (event.eventFlags & EVENT_FLAGS.TX_PENDING) > 0,
  shouldBeRemoved: (event.eventFlags & EVENT_FLAGS.REMOVE_EVENT) > 0,
  snapshotBegin: (event.eventFlags & EVENT_FLAGS.SNAPSHOT_BEGIN) > 0,
  snapshotEnd: (event.eventFlags & EVENT_FLAGS.SNAPSHOT_END) > 0,
  snapshotSnip: (event.eventFlags & EVENT_FLAGS.SNAPSHOT_SNIP) > 0,
})

export type DXLinkCandlesOptions = Readonly<{
  logLevel?: DXLinkLogLevel
  /** Feed qualification, forwarded to the underlying HISTORY feed. */
  feed?: string
  /** Feed space, forwarded to the underlying HISTORY feed. */
  space?: string
}>

/**
 * Candle aggregator over a HISTORY feed: configures the feed for COMPACT Candle events,
 * tracks snapshot and transaction flags, and maintains an index-sorted candle list.
 *
 * Listeners receive the whole list each time it changes, flagged as a snapshot when the
 * change replaced it rather than amended it.
 */
export class DXLinkCandles {
  private readonly feed: DXLinkFeed<FeedContract.HISTORY>

  private isPartialSnapshot = false
  private isCompleteSnapshot = false

  private queue: Array<DXLinkCandleEvent> = []
  private readonly events = new SortedList<DXLinkCandleEvent>((a, b) => a.index - b.index)

  private readonly listeners = new Set<(data: DXLinkCandleData) => void>()

  constructor(client: DXLinkClient, options: DXLinkCandlesOptions = {}) {
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
      events.filter(isCandleEvent).forEach(this.processEvent)
    })
  }

  getChannel = () => this.feed.getChannel()

  setSubscription = (subscription: DXLinkCandleSubscription): void => {
    this.feed.clearSubscriptions()
    this.feed.addSubscriptions({ type: 'Candle', ...subscription })
  }

  addListener(listener: (data: DXLinkCandleData) => void): void {
    this.listeners.add(listener)
  }

  removeListener(listener: (data: DXLinkCandleData) => void): void {
    this.listeners.delete(listener)
  }

  close(): void {
    this.feed.close()
  }

  private processEvent = (event: DXLinkCandleEvent): void => {
    const eventFlags = parseEventFlags(event)
    if (eventFlags.snapshotBegin) {
      this.queue = []
      this.isPartialSnapshot = true
      this.isCompleteSnapshot = false
    }

    if (this.isPartialSnapshot && (eventFlags.snapshotEnd || eventFlags.snapshotSnip)) {
      this.isPartialSnapshot = false
      this.isCompleteSnapshot = true
    }

    this.queue.push(event)

    if (eventFlags.txPending || this.isPartialSnapshot) {
      return
    }

    const isSnapshot = this.isCompleteSnapshot
    if (isSnapshot) {
      this.isCompleteSnapshot = false
      this.events.clear()
    }

    const queued = this.queue
    this.queue = []
    const changes = queued.map((next) => {
      if (parseEventFlags(next).shouldBeRemoved) {
        return this.events.remove(next)
      }
      this.events.insert(next)

      return true
    })

    if (changes.includes(true)) {
      const data = { isSnapshot, events: this.events.toArray() }
      this.listeners.forEach((listener) => {
        listener(data)
      })
    }
  }
}
