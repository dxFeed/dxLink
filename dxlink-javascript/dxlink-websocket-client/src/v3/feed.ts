import {
  DXLinkChannel,
  DXLinkChannelMessage,
  DXLinkChannelState,
  DXLinkError,
  DXLinkWebSocketClient,
} from './dxlink'
import {
  FeedEventFields,
  FeedContract,
  FeedDataFormat,
  IndexedEventSubscription,
  Subscription,
  TimeSeriesSubscription,
  FeedSetupMessage,
  FeedSubscriptionMessage,
  isFeedMessage,
  isFeedFullData,
  FeedDataMessage,
  isFeedCompactData,
  FeedEventData,
  FeedEventValue,
  FeedConfigMessage,
} from './feed-messages'
import { DXLinkLogLevel, DXLinkLogger, Logger } from './logger'

/**
 * Prefered configuration for the feed channel.
 * Server can ignore some of the parameters and use own defaults.
 * @see {DXLinkFeed.configure}
 */
export interface FeedAcceptConfig {
  /**
   * Aggregation period in seconds.
   * If not specified, the channel will use the default value.
   * If specified as 0, the channel will try not aggregate events.
   */
  acceptAggregationPeriod?: number
  /**
   * Data format to be used for received events.
   * If not specified, the channel will use the default value `FULL`.
   */
  acceptDataFormat?: FeedDataFormat
  /**
   * Event fields to be included in received events.
   * If not specified, the channel will use the default value.
   * If specified as an empty array, the channel will try to send events with default fields.
   */
  acceptEventFields?: FeedEventFields
}

export {
  type FeedEventFields,
  FeedContract,
  FeedDataFormat,
  type Subscription,
  type TimeSeriesSubscription,
  type IndexedEventSubscription,
  type FeedEventData,
  type FeedEventValue,
}

/**
 * Configuration of the feed channel.
 */
export interface FeedConfig {
  /**
   * Aggregation period in seconds.
   * @example 0.5 - 500 milliseconds.
   * @default `NaN`
   * @see {FeedAcceptConfig.acceptAggregationPeriod}
   */
  readonly aggregationPeriod: number
  /**
   * Data format to be used for received events.
   * @example `FULL` - object with keys and values.
   * @example `COMPACT` - array of values.
   * @default `FULL`
   * @see {FeedAcceptConfig.acceptDataFormat}
   */
  readonly dataFormat: FeedDataFormat
  /**
   * Event fields to be included in received events.
   * You can specify fields for all event types or for specific event types @see {FeedAcceptConfig.acceptEventFields}.
   * @example ```json
   * { "Quote": ["eventSymbol", "askPrice", "bidPrice"] }
   * ```
   * @default `{}`
   */
  readonly eventFields: FeedEventFields
}

/**
 * Listner for the feed channel config changes.
 */
export type DXLinkFeedConfigChangeListner = (config: FeedConfig) => void

type AnySubscription = Subscription | TimeSeriesSubscription | IndexedEventSubscription

/**
 * Get a unique key for the subscription.
 */
const getSubscriptionKey = (subscription: AnySubscription) =>
  `${subscription.type}${'source' in subscription ? `#${subscription.source}` : ''}:${
    subscription.symbol
  }`

/**
 * Subscription type by the contract.
 */
export type SubscriptionByContract<Contract extends FeedContract> = {
  [FeedContract.AUTO]: Subscription | TimeSeriesSubscription | IndexedEventSubscription
  [FeedContract.TICKER]: Subscription
  [FeedContract.HISTORY]: TimeSeriesSubscription | IndexedEventSubscription
  [FeedContract.STREAM]: Subscription | TimeSeriesSubscription | IndexedEventSubscription
}[Contract]

/**
 * Listner for the feed channel events received from the channel.
 */
export type DXLinkFeedEventListner = (event: FeedEventData[]) => void

/**
 * Chunk of the subscriptions to be sent to the channel.
 */
interface FeedSubscriptionChunk {
  add?: AnySubscription[]
  remove?: AnySubscription[]
  reset?: boolean
}

/**
 * dxLink FEED service instance for the specified {@link FeedContract}.
 */
export interface DXLinkFeed<
  Sub extends Subscription = AnySubscription,
  Contract extends FeedContract = FeedContract.AUTO
> {
  /**
   * Unique identifier of the feed channel.
   */
  readonly id: number
  /**
   * Contract of the feed channel.
   * @see {FeedContract}
   */
  readonly contract: Contract

  /**
   * Configure desired configuration of the feed channel.
   * @see {FeedAcceptConfig}
   */
  configure(acceptConfig: FeedAcceptConfig): void

  /**
   * Get current configuration of the feed channel as received from the channel.
   */
  getConfig(): FeedConfig
  /**
   * Add a listener for the feed channel config changes.
   */
  addConfigChangeListener(listener: DXLinkFeedConfigChangeListner): void
  /**
   * Remove a listener for the feed channel config changes.
   */
  removeConfigChangeListener(listener: DXLinkFeedConfigChangeListner): void

  /**
   * Add subscriptions to the feed channel.
   * @param subscriptions - Subscriptions to be added.
   */
  addSubscriptions(subscriptions: Sub[]): void
  /**
   * Add subscriptions to the feed channel.
   * @param subscriptions - Subscriptions to be added.
   */
  addSubscriptions(...subscriptions: Sub[]): void
  /**
   * Remove subscriptions from the feed channel.
   * @param subscriptions - Subscriptions to be removed.
   */
  removeSubscriptions(subscriptions: Sub[]): void
  /**
   * Remove subscriptions from the feed channel.
   * @param subscriptions - Subscriptions to be removed.
   */
  removeSubscriptions(...subscriptions: Sub[]): void
  /**
   * Remove all active subscriptions from the feed channel.
   */
  clearSubscriptions(): void

  /**
   * Add a listener for the feed channel events received from the channel.
   */
  addEventListener(listener: DXLinkFeedEventListner): void
  /**
   * Remove a listener for the feed channel events received from the channel.
   */
  removeEventListener(listener: DXLinkFeedEventListner): void

  /**
   * Close the feed channel.
   */
  close(): void
}

/**
 * Options for the {@link DXLinkFeedImpl} instance.
 */
export interface DXLinkFeedOptions {
  /**
   * Time in milliseconds to wait for more pending subscriptions before sending them to the channel.
   */
  batchSubscriptionsTime: number
  /**
   * Maximum size of the subscription chunk to be sent to the channel.
   */
  maxSendSubscriptionChunkSize: number
  /**
   * Log level for the feed.
   */
  logLevel: DXLinkLogLevel
}

export class DXLinkFeedImpl<Contract extends FeedContract>
  implements DXLinkFeed<SubscriptionByContract<Contract>, Contract>
{
  public readonly id: number

  private readonly options: DXLinkFeedOptions

  /**
   * dxLink channel instance.
   */
  private readonly channel: DXLinkChannel

  /**
   * Current accept config of the feed channel.
   */
  private acceptConfig: FeedAcceptConfig = {}

  /**
   * Current config of the feed channel.
   */
  private config: FeedConfig = {
    aggregationPeriod: NaN,
    dataFormat: FeedDataFormat.FULL,
    eventFields: {},
  }

  // Listeners
  private readonly configListeners = new Set<DXLinkFeedConfigChangeListner>()
  private readonly eventListeners = new Set<DXLinkFeedEventListner>()

  /**
   * Pending add subscriptions to be sent to the channel.
   */
  private readonly pendingAdd = new Map<string, AnySubscription>()
  /**
   * Pending remove subscriptions to be sent to the channel.
   */
  private readonly pendingRemove = new Map<string, AnySubscription>()
  /**
   * Pending reset flag to be sent to the channel.
   */
  private pengingReset = false

  /**
   * List of active subscriptions.
   * Used to avoid sending the same subscription twice and re-subscribe on the channel re-open.
   */
  private readonly subscriptions = new Map<string, AnySubscription>()

  /**
   * List of event types which schema was sent to the channel.
   */
  private readonly touchedEvents = new Set<string>()

  /**
   * Timeout identifier for the {@link scheduleProcessPendings} method.
   */
  private scheduleTimeoutId: any

  private readonly logger: DXLinkLogger

  /**
   * Allows to create {@link DXLinkFeed} instance with the specified {@link FeedContract} for the given {@link DXLinkWebSocketClient}.
   */
  constructor(
    client: DXLinkWebSocketClient,
    public readonly contract: Contract,
    options: Partial<DXLinkFeedOptions> = {}
  ) {
    this.options = {
      logLevel: DXLinkLogLevel.WARN,
      batchSubscriptionsTime: 100,
      maxSendSubscriptionChunkSize: 4096 * 2,
      ...options,
    }

    this.channel = client.openChannel('FEED', { contract })
    this.id = this.channel.id
    this.channel.addMessageListener(this.processMessage)
    this.channel.addStateChangeListener(this.processStatus)
    this.channel.addErrorListener(this.processError)

    this.addSubscriptions = this.addSubscriptions.bind(this)
    this.removeSubscriptions = this.removeSubscriptions.bind(this)

    this.logger = new Logger(`${DXLinkFeedImpl.name}#${this.id}`, this.options.logLevel)
  }

  addConfigChangeListener = (listener: DXLinkFeedConfigChangeListner) =>
    this.configListeners.add(listener)

  removeConfigChangeListener = (listener: DXLinkFeedConfigChangeListner) =>
    this.configListeners.delete(listener)

  close = () => {
    this.acceptConfig = {}

    this.configListeners.clear()
    this.eventListeners.clear()

    this.pendingAdd.clear()
    this.pendingRemove.clear()
    this.touchedEvents.clear()
    this.subscriptions.clear()
    this.touchedEvents.clear()

    if (this.scheduleTimeoutId !== undefined) {
      clearTimeout(this.scheduleTimeoutId)
      this.scheduleTimeoutId = undefined
    }

    this.channel.close()
  }

  configure = (acceptConfig: FeedAcceptConfig) => {
    this.acceptConfig = acceptConfig

    // Update touched events list
    if (this.channel.getState() === DXLinkChannelState.OPENED) {
      this.sendAcceptConfig(this.touchedEvents)
    }
  }

  getConfig = () => this.config

  addSubscriptions(subscriptions: SubscriptionByContract<Contract>[]): void
  addSubscriptions(...subscriptions: SubscriptionByContract<Contract>[]): void
  addSubscriptions(...args: unknown[]): void {
    const subscriptions: SubscriptionByContract<Contract>[] = Array.isArray(args[0])
      ? args[0]
      : args

    for (const subscription of subscriptions) {
      this.pendingAdd.set(getSubscriptionKey(subscription), subscription)
    }

    this.scheduleProcessPendings()
  }

  removeSubscriptions(subscriptions: SubscriptionByContract<Contract>[]): void
  removeSubscriptions(...subscriptions: SubscriptionByContract<Contract>[]): void
  removeSubscriptions(...args: unknown[]): void {
    const subscriptions: SubscriptionByContract<Contract>[] = Array.isArray(args[0])
      ? args[0]
      : args

    for (const subscription of subscriptions) {
      const key = getSubscriptionKey(subscription)
      this.pendingRemove.set(key, subscription)
      this.pendingAdd.delete(key)
    }

    this.scheduleProcessPendings()
  }

  clearSubscriptions = () => {
    this.pendingAdd.clear()
    this.pendingRemove.clear()
    this.pengingReset = true

    this.scheduleProcessPendings()
  }

  addEventListener = (listener: DXLinkFeedEventListner) => this.eventListeners.add(listener)
  removeEventListener = (listener: DXLinkFeedEventListner) => this.eventListeners.delete(listener)

  /**
   * Process message received in the channel.
   */
  private processMessage = (message: DXLinkChannelMessage) => {
    // Parse message
    if (isFeedMessage(message)) {
      switch (message.type) {
        case 'FEED_CONFIG':
          this.processConfig(message)
          return
        case 'FEED_DATA':
          this.processData(message)
          return
      }
    }

    this.logger.warn('Unknown message', message)
  }

  /**
   * Process config received from the channel.
   */
  private processConfig = (config: FeedConfigMessage) => {
    // Update config with the new values from the channel
    const newConfig: FeedConfig = {
      aggregationPeriod: config.aggregationPeriod ?? this.config.aggregationPeriod,
      dataFormat: config.dataFormat ?? this.config.dataFormat,
      eventFields: {
        ...(this.config.eventFields ?? {}),
        ...(config.eventFields ?? {}),
      },
    }

    this.config = newConfig

    // Notify listeners
    for (const listener of this.configListeners) {
      try {
        listener(newConfig)
      } catch (error) {
        this.logger.error('Error in config listener', error)
      }
    }
  }

  /**
   * Parse data received from the channel.
   */
  private parseEventData = (data: FeedDataMessage['data']) => {
    const { dataFormat, eventFields } = this.config
    if (dataFormat === 'FULL') {
      if (isFeedFullData(data)) {
        // If data is already in the full format, just return it
        return data
      }
    } else if (isFeedCompactData(data)) {
      // If data is in the compact format, parse it
      const events: FeedEventData[] = []

      const [eventType, values] = data
      const eventFieldsForType = eventFields[eventType]
      if (eventFieldsForType === undefined) {
        throw new Error('Cannot find event fields for event type in the config')
      }

      // Split values into events
      let cursor = 0
      while (cursor < values.length) {
        const event: FeedEventData = {
          eventType,
        }

        // Build event object from the values
        for (const field of eventFieldsForType) {
          const value = values[cursor]
          if (value === undefined) {
            throw new Error('Not enough values in compact event')
          }
          event[field] = value
          cursor++
        }
        events.push(event)
      }

      return events
    }

    throw new Error('Incoming data does not match the format specified in the config')
  }

  /**
   * Process data received from the channel.
   */
  private processData = ({ data }: FeedDataMessage) => {
    try {
      const events = this.parseEventData(data)

      for (const listener of this.eventListeners) {
        try {
          listener(events)
        } catch (error) {
          this.logger.error('Error in event listener', error)
        }
      }
    } catch (error) {
      this.logger.error('Cannot parse data', error)
      return
    }
  }

  /**
   * Process channel status changes from the channel.
   */
  private processStatus = (processStatus: DXLinkChannelState) => {
    switch (processStatus) {
      case DXLinkChannelState.OPENED: {
        this.sendAcceptConfig(this.touchedEvents, true)

        return this.resubscribe()
      }
      case DXLinkChannelState.REQUESTED: {
        // Clear the timeout if it is set to avoid sending the subscriptions while the channel is not ready
        if (this.scheduleTimeoutId !== undefined) {
          clearTimeout(this.scheduleTimeoutId)
          this.scheduleTimeoutId = undefined
        }
      }
      case DXLinkChannelState.CLOSED:
        // Destroy the channel if it is closed by the channel
        return this.close()
    }
  }

  /**
   * Send the subscription chunk to the channel.
   * @param chunk Subscription chunk to be sent to the channel.
   * @param newTouchedEvents List of event types which schema should be sent to the channel before the chunk.
   * @returns
   */
  private sendSubscriptionChunkAndSchema = (
    chunk: FeedSubscriptionChunk,
    newTouchedEvents?: Set<string>
  ) => {
    if (this.channel.getState() !== DXLinkChannelState.OPENED) return // If the channel is not ready, just exit

    if (newTouchedEvents !== undefined && newTouchedEvents.size > 0) {
      this.sendAcceptConfig(newTouchedEvents)
    }

    this.channel.send({
      type: 'FEED_SUBSCRIPTION',
      ...chunk,
    } satisfies FeedSubscriptionMessage)
  }

  /**
   * Process error received from the channel.
   */
  private processError = (processError: DXLinkError) => {
    this.logger.error('Error in channel', processError)
  }

  /**
   * Resubscribe to the feed channel subscriptions after the channel re-open.
   */
  private resubscribe() {
    // Merge pending add subscriptions with current subscriptions
    for (const [key, subscription] of this.subscriptions) {
      this.pendingAdd.set(key, subscription)
    }

    if (this.pendingAdd.size === 0) return // If there is no subscriptions to send, just exit

    // Clear pending remove subscriptions
    this.pendingRemove.clear()
    this.pengingReset = true

    // Send the subscriptions to the channel imidiately
    this.processPendings()
  }

  /**
   * Schedule sending pending subscriptions to the channel to batch them together to reduce the number of messages.
   */
  private scheduleProcessPendings() {
    if (this.scheduleTimeoutId !== undefined) {
      return
    }

    this.scheduleTimeoutId = setTimeout(() => {
      this.scheduleTimeoutId = undefined

      this.processPendings()
    }, this.options.batchSubscriptionsTime)
  }

  /**
   * Process pending subscriptions and send them to the channel.
   */
  private processPendings() {
    let newTouchedEvents = new Set<string>() // New events to be sent to the channel
    let chunk: FeedSubscriptionChunk = {} // Chunk to be sent to the channel
    let chunkSize = 0 // Approximate size of the chunk in bytes

    // Add `reset` flag to the chunk
    if (this.pengingReset) {
      chunk.reset = true
      chunkSize += 13 // ',"reset":true'.length
      this.pengingReset = false
    }

    // Add `remove` subscriptions to the chunk
    for (const [key, subscription] of this.pendingRemove.entries()) {
      ;(chunk.remove ??= []).push(subscription)
      chunkSize += key.length + ('fromTime' in subscription ? 34 : 21) // Approximate size of the subscription in bytes

      // Remove the subscription from the active subscriptions
      this.subscriptions.delete(getSubscriptionKey(subscription))

      // Send the chunk if it is too big already
      if (chunkSize >= this.options.maxSendSubscriptionChunkSize) {
        this.sendSubscriptionChunkAndSchema(chunk)
        chunk = {}
        chunkSize = 0
      }
    }
    this.pendingRemove.clear()

    // Add `add` subscriptions to the chunk
    for (const [key, subscription] of this.pendingAdd.entries()) {
      ;(chunk.add ??= []).push(subscription)
      chunkSize += key.length + ('fromTime' in subscription ? 34 : 21) // Approximate size of the subscription in bytes

      // Add the event type to the new touched events if it is not touched yet
      if (!this.touchedEvents.has(subscription.type)) {
        newTouchedEvents.add(subscription.type)
        this.touchedEvents.add(subscription.type)
      }

      // Add the subscription to the active subscriptions
      this.subscriptions.set(key, subscription)

      // Send the chunk if it is too big already
      if (chunkSize >= this.options.maxSendSubscriptionChunkSize) {
        this.sendSubscriptionChunkAndSchema(chunk, newTouchedEvents)
        newTouchedEvents.clear()
        chunk = {}
        chunkSize = 0
      }
    }
    this.pendingAdd.clear()

    // Send the last chunk
    if (chunkSize > 0) {
      this.sendSubscriptionChunkAndSchema(chunk, newTouchedEvents)
    }
  }

  /**
   * Send the `FEED_SETUP` message to the channel with the event fields for the specified event types.
   * @param events List of event feilds to be sent to the channel.
   * @param force If `true`, the config will be sent to the channel even if there is no event fields to send.
   */
  private sendAcceptConfig = (events: Set<string>, force: boolean = false) => {
    let acceptEventFields: FeedEventFields | undefined

    if (this.acceptConfig.acceptEventFields !== undefined) {
      for (const eventType of events) {
        const eventFields = this.acceptConfig.acceptEventFields[eventType]
        if (eventFields !== undefined) {
          acceptEventFields ??= {}
          acceptEventFields[eventType] = eventFields
        }
      }
    }

    const { acceptAggregationPeriod, acceptDataFormat } = this.acceptConfig

    if (
      acceptEventFields === undefined &&
      acceptAggregationPeriod === undefined &&
      acceptDataFormat === undefined
    ) {
      // Nothing to send
      return
    }

    // Send the config to the channel if there is event fields to send or if it is forced to send
    if (force || acceptEventFields !== undefined) {
      this.channel.send({
        type: 'FEED_SETUP',
        acceptAggregationPeriod,
        acceptDataFormat,
        acceptEventFields,
      } satisfies FeedSetupMessage)
    }
  }
}
