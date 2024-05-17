import {
  DXLinkFeed,
  DXLinkLogLevel,
  FeedContract,
  FeedDataFormat,
  type DXLinkClient,
  type FeedEventData,
} from '@dxfeed/dxlink-api'

import { SortedList } from './sorted-list'

export enum EventFlags {
  /**
   * (0x01) TX_PENDING indicates a pending transactional update. When TX_PENDING is 1, it means that an ongoing transaction
   * update, that spans multiple events, is in process.
   */
  TxPending = 0x01,

  /**
   * (0x02) REMOVE_EVENT indicates that the event with the corresponding index has to be removed.
   */
  RemoveEvent = 0x02,

  /**
   * (0x04) SNAPSHOT_BEGIN indicates when the loading of a snapshot starts. Snapshot load starts on new subscription and
   * the first indexed event that arrives for each exchange code (in the case of a regional record) on a new
   * subscription may have SNAPSHOT_BEGIN set to true. It means that an ongoing snapshot consisting of multiple
   * events is incoming.
   */
  SnapshotBegin = 0x04,

  /**
   * (0x08) SNAPSHOT_END or (0x10) SNAPSHOT_SNIP indicates the end of a snapshot. The difference between SNAPSHOT_END and
   * SNAPSHOT_SNIP is the following: SNAPSHOT_END indicates that the data source sent all the data pertaining to
   * the subscription for the corresponding indexed event, while SNAPSHOT_SNIP indicates that some limit on the
   * amount of data was reached and while there still might be more data available, it will not be provided.
   */
  SnapshotEnd = 0x08,

  /**
   * (0x08) SNAPSHOT_END or (0x10) SNAPSHOT_SNIP indicates the end of a snapshot. The difference between SNAPSHOT_END and
   * SNAPSHOT_SNIP is the following: SNAPSHOT_END indicates that the data source sent all the data pertaining to
   * the subscription for the corresponding indexed event, while SNAPSHOT_SNIP indicates that some limit on the
   * amount of data was reached and while there still might be more data available, it will not be provided.
   */
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
  /**
   * Log level for the feed.
   */
  logLevel: DXLinkLogLevel
}

export class DXLinkCandles {
  private readonly feed: DXLinkFeed<FeedContract.HISTORY>

  // Algorithm
  private isPartialSnapshot = false // snapshot pending
  private isCompleteSnapshot = false // snapshot received in pending queue

  private pQueue: DXLinkCandleEvent[] = [] // pending queue
  private events = new SortedList<DXLinkCandleEvent>((a, b) => a.index - b.index) // events accumulator

  private listeners = new Set<(data: DXLinkCandleData) => void>() // listeners

  constructor(
    private readonly client: DXLinkClient,
    options?: Partial<DXLinkCandlesOptions>
  ) {
    this.feed = new DXLinkFeed(client, FeedContract.HISTORY, options)

    // Configure feed
    this.feed.configure({
      acceptDataFormat: FeedDataFormat.COMPACT,
      // Accept only necessary fields
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

    // Listen to feed events
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

  getChannel = () => {
    return this.feed.getChannel()
  }

  setSubscription = (subscription: DXLinkCandleSubscription) => {
    this.feed.clearSubscriptions()
    this.feed.addSubscriptions({
      type: 'Candle',
      ...subscription,
    })
  }

  addListener(listener: (snapshot: DXLinkCandleData) => void) {
    this.listeners.add(listener)
  }

  removeListener(listener: (snapshot: DXLinkCandleData) => void) {
    this.listeners.delete(listener)
  }

  private processEvent = (event: DXLinkCandleEvent) => {
    const eventFlags = parseEventFlags(event)
    // Process snapshot start and clear params
    if (eventFlags.snapshotBegin) {
      this.pQueue = [] // clear pending queue on new snapshot
      this.isPartialSnapshot = true // snapshot is pending
      this.isCompleteSnapshot = false // complete snapshot in the queue
    }

    // Process snapshot end after snapshot begin was received
    if (this.isPartialSnapshot && (eventFlags.snapshotEnd || eventFlags.snapshotSnip)) {
      this.isPartialSnapshot = false
      this.isCompleteSnapshot = true
    }

    // Add event in queue
    this.pQueue.push(event)

    // If the snapshot is not ready, skip processing
    if (eventFlags.txPending || this.isPartialSnapshot) {
      return
    }

    // If the snapshot
    const isCompleteSnapshot = this.isCompleteSnapshot
    if (this.isCompleteSnapshot) {
      this.isCompleteSnapshot = false
      this.events.clear() // remove any unprocessed leftovers on new snapshot
    }

    // process pending queue
    let hasChanged = false
    for (let event = this.pQueue.shift(); event !== undefined; event = this.pQueue.shift()) {
      const { shouldBeRemoved } = parseEventFlags(event)
      if (shouldBeRemoved) {
        // If should be remove
        if (!this.events.remove(event)) {
          // If not removed
          continue
        }
      } else {
        // Add or replace event
        this.events.insert(event)
      }

      hasChanged = true
    }

    // Notify listeners
    if (hasChanged) {
      for (const listener of this.listeners) {
        listener({
          isSnapshot: isCompleteSnapshot,
          events: this.events.toArray(),
        })
      }
    }
  }

  close() {
    this.feed.close()
  }
}
