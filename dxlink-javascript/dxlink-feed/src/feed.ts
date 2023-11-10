import {
  type DXLinkChannel,
  type DXLinkChannelMessage,
  DXLinkChannelState,
  type DXLinkChannelStateChangeListener,
  type DXLinkError,
  type DXLinkClient,
  DXLinkLogLevel,
  type DXLinkLogger,
  Logger,
  Scheduler,
} from '@dxfeed/dxlink-core'

import {
  type FeedEventFields,
  FeedContract,
  FeedDataFormat,
  type IndexedEventSubscription,
  type Subscription,
  type TimeSeriesSubscription,
  type FeedSetupMessage,
  type FeedSubscriptionMessage,
  isFeedMessage,
  isFeedFullData,
  type FeedDataMessage,
  isFeedCompactData,
  type FeedEventData,
  type FeedConfigMessage,
} from './messages'

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
 * Listener for the feed channel config changes.
 */
export type DXLinkFeedConfigChangeListener = (config: FeedConfig) => void

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
export type SubscriptionByContract = {
  [FeedContract.AUTO]: Subscription | TimeSeriesSubscription | IndexedEventSubscription
  [FeedContract.TICKER]: Subscription
  [FeedContract.HISTORY]: TimeSeriesSubscription | IndexedEventSubscription
  [FeedContract.STREAM]: Subscription | TimeSeriesSubscription | IndexedEventSubscription
}

/**
 * Listener for the feed channel events received from the channel.
 */
export type DXLinkFeedEventListener = (event: FeedEventData[]) => void

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
export interface DXLinkFeedRequester<Contract extends FeedContract = FeedContract.AUTO> {
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
   * Get current channel of the feed.
   * Note: inaproppriate usage of the channel can lead to unexpected behavior.
   * @see {DXLinkChannel}
   */
  getChannel(): DXLinkChannel

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
  addConfigChangeListener(listener: DXLinkFeedConfigChangeListener): void
  /**
   * Remove a listener for the feed channel config changes.
   */
  removeConfigChangeListener(listener: DXLinkFeedConfigChangeListener): void

  /**
   * Add subscriptions to the feed channel.
   * @param subscriptions - Subscriptions to be added.
   */
  addSubscriptions(subscriptions: SubscriptionByContract[Contract][]): void
  /**
   * Add subscriptions to the feed channel.
   * @param subscriptions - Subscriptions to be added.
   */
  addSubscriptions(...subscriptions: SubscriptionByContract[Contract][]): void
  /**
   * Remove subscriptions from the feed channel.
   * @param subscriptions - Subscriptions to be removed.
   */
  removeSubscriptions(subscriptions: SubscriptionByContract[Contract][]): void
  /**
   * Remove subscriptions from the feed channel.
   * @param subscriptions - Subscriptions to be removed.
   */
  removeSubscriptions(...subscriptions: SubscriptionByContract[Contract][]): void
  /**
   * Remove all active subscriptions from the feed channel.
   */
  clearSubscriptions(): void

  /**
   * Add a listener for the feed channel events received from the channel.
   */
  addEventListener(listener: DXLinkFeedEventListener): void
  /**
   * Remove a listener for the feed channel events received from the channel.
   */
  removeEventListener(listener: DXLinkFeedEventListener): void

  /**
   * Close the feed channel.
   */
  close(): void
}

/**
 * Options for the {@link DXLinkFeed} instance.
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

const FEED_SERVICE_NAME = 'FEED'

/**
 * dxLink FEED provides access to the real-time and historical data of dxFeed.
 */
export class DXLinkFeed<Contract extends FeedContract> implements DXLinkFeedRequester<Contract> {
  /**
   * Unique identifier of the feed channel.
   */
  public readonly id: number

  /**
   * Contract of the feed channel.
   * @see {FeedContract}
   */
  public contract: Contract

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
  private readonly configListeners = new Set<DXLinkFeedConfigChangeListener>()
  private readonly eventListeners = new Set<DXLinkFeedEventListener>()

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
   * Scheduler for scheduling subscriptions sending to the channel.
   */
  private subScheduler: Scheduler = new Scheduler()

  private readonly logger: DXLinkLogger

  /**
   * Allows to create {@link DXLinkFeed} instance with the specified {@link FeedContract} for the given {@link DXLinkWebSocketClient}.
   */
  constructor(client: DXLinkClient, contract: Contract, options: Partial<DXLinkFeedOptions> = {}) {
    this.options = {
      logLevel: DXLinkLogLevel.WARN,
      batchSubscriptionsTime: 100,
      maxSendSubscriptionChunkSize: 4096 * 2,
      ...options,
    }

    this.channel = client.openChannel(FEED_SERVICE_NAME, { contract })
    this.id = this.channel.id
    this.contract = contract
    this.channel.addMessageListener(this.processMessage)
    this.channel.addStateChangeListener(this.processStatus)
    this.channel.addErrorListener(this.processError)

    this.addSubscriptions = this.addSubscriptions.bind(this)
    this.removeSubscriptions = this.removeSubscriptions.bind(this)

    this.logger = new Logger(`${DXLinkFeed.name}#${this.id}`, this.options.logLevel)
  }

  getChannel = () => this.channel

  getState = () => this.channel.getState()
  addStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.addStateChangeListener(listener)
  removeStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.removeStateChangeListener(listener)

  getConfig = () => this.config
  addConfigChangeListener = (listener: DXLinkFeedConfigChangeListener) => {
    this.configListeners.add(listener)
  }
  removeConfigChangeListener = (listener: DXLinkFeedConfigChangeListener) => {
    this.configListeners.delete(listener)
  }

  close = () => {
    this.acceptConfig = {}

    this.configListeners.clear()
    this.eventListeners.clear()

    this.pendingAdd.clear()
    this.pendingRemove.clear()
    this.touchedEvents.clear()
    this.subscriptions.clear()
    this.touchedEvents.clear()

    this.subScheduler.clear()

    this.channel.close()
  }

  configure = (acceptConfig: FeedAcceptConfig) => {
    this.acceptConfig = acceptConfig

    // Update touched events list
    if (this.channel.getState() === DXLinkChannelState.OPENED) {
      this.sendAcceptConfig(this.touchedEvents)
    }
  }

  addSubscriptions(subscriptions: SubscriptionByContract[Contract][]): void
  addSubscriptions(...subscriptions: SubscriptionByContract[Contract][]): void
  addSubscriptions(...args: unknown[]): void {
    const inputs: SubscriptionByContract[Contract][] = Array.isArray(args[0]) ? args[0] : args

    for (const input of inputs) {
      const subscription = this.cleanSubscription(input)

      this.pendingAdd.set(getSubscriptionKey(subscription), subscription)
    }

    this.scheduleProcessPendings()
  }

  removeSubscriptions(subscriptions: SubscriptionByContract[Contract][]): void
  removeSubscriptions(...subscriptions: SubscriptionByContract[Contract][]): void
  removeSubscriptions(...args: unknown[]): void {
    const inputs: SubscriptionByContract[Contract][] = Array.isArray(args[0]) ? args[0] : args

    for (const input of inputs) {
      const subscription = this.cleanSubscription(input)

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

  addEventListener = (listener: DXLinkFeedEventListener) => {
    this.eventListeners.add(listener)
  }
  removeEventListener = (listener: DXLinkFeedEventListener) => {
    this.eventListeners.delete(listener)
  }

  /**
   * Clean the subscription from the fields which are not allowed for the specified contract.
   * Note: coze of the TypeScript limitations, we need to clean the subscription from the fields which are not allowed for the specified contract.
   */
  private cleanSubscription = (
    subscription: SubscriptionByContract[Contract]
  ): SubscriptionByContract[Contract] => {
    if (this.contract === FeedContract.TICKER) {
      const { type, symbol, ...other } = subscription
      if (Object.keys(other).length > 0) {
        this.logger.warn(
          'Subscription for the TICKER contract should not have any additional fields',
          subscription
        )
      }
      return { type, symbol } as unknown as SubscriptionByContract[Contract]
    }

    return subscription
  }

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
        this.subScheduler.clear()
        return
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
    if (this.subScheduler.has('processPendings')) {
      return
    }

    this.subScheduler.schedule(
      this.processPendings,
      this.options.batchSubscriptionsTime,
      'processPendings'
    )
  }

  /**
   * Process pending subscriptions and send them to the channel.
   */
  private processPendings = () => {
    const newTouchedEvents = new Set<string>() // New events to be sent to the channel
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
   * @param eventTypes List of event type fields to be sent to the channel.
   * @param force If `true`, the config will be sent to the channel even if there is no event fields to send.
   */
  private sendAcceptConfig = (eventTypes: Set<string>, force: boolean = false) => {
    let acceptEventFields: FeedEventFields | undefined

    // Get event fields for the specified event types
    if (this.acceptConfig.acceptEventFields !== undefined) {
      for (const eventType of eventTypes) {
        const eventFields = this.acceptConfig.acceptEventFields[eventType]
        if (eventFields !== undefined) {
          acceptEventFields ??= {}
          acceptEventFields[eventType] = eventFields
        }
      }
    }

    const { acceptAggregationPeriod, acceptDataFormat } = this.acceptConfig

    // Check if there is anything to send
    if (
      acceptEventFields === undefined &&
      acceptAggregationPeriod === undefined &&
      acceptDataFormat === undefined
    ) {
      return // Nothing to send
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
