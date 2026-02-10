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
} from '@dxfeed/dxlink-core'

import {
  isDepthOfMarketMessage,
  DepthOfMarketDataFormat,
  type DepthOfMarketOrder,
  type DepthOfMarketSetupMessage,
  type DepthOfMarketSnapshotMessage,
  type DepthOfMarketConfigMessage,
  type DepthOfMarketParameters,
} from './messages'

/**
 * Prefered configuration for the DepthOfMarket channel.
 * Server can ignore some of the parameters and use own defaults.
 * @see {DXLinkDepthOfMarket.configure}
 */
export interface DepthOfMarketAcceptConfig {
  /**
   * Aggregation period in seconds.
   * If not specified, the channel will use the default value.
   * If specified as 0, the channel will try not aggregate snapshot updates.
   */
  readonly acceptAggregationPeriod?: number
  /**
   * Ddepth limit of received orders.
   * If not specified, the channel will use the default value.
   * If specified as 0, the channel will try not to limit orders.
   */
  readonly acceptDepthLimit?: number
  /**
   * Data format to be used for received events.
   * If not specified, the channel will use the default value `FULL`.
   */
  readonly acceptDataFormat?: DepthOfMarketDataFormat
  /**
   * Event fields to be included in received events.
   * If not specified, the channel will use the default value.
   * If specified as an empty array, the channel will try to send events with default fields.
   */
  readonly acceptOrderFields?: string[]
}

/**
 * Configuration of the DepthOfMarket channel.
 */
export interface DepthOfMarketConfig {
  /**
   * Aggregation period in seconds.
   * @example 0.5 - 500 milliseconds.
   * @default `NaN`
   * @see {DepthOfMarketAcceptConfig.acceptAggregationPeriod}
   */
  readonly aggregationPeriod: number
  /**
   * Ddepth limit of received orders.
   * @example 10 - 10 orders in each asks and bids arrays.
   * @default 10
   */
  readonly depthLimit: number
  /**
   * Data format to be used for received orders.
   * @example `FULL` - object with keys and values.
   * @default `FULL`
   * @see {DepthOfMarketAcceptConfig.acceptDataFormat}
   */
  readonly dataFormat: DepthOfMarketDataFormat
  /**
   * Order fields to be included in received snapshot.
   * You can specify fields for all event types or for specific event types @see {DepthOfMarketAcceptConfig.acceptEventFields}.
   * @example ```json
   * ["price", "size"]
   * ```
   * @default `["price", "size"]`
   */
  readonly orderFields: string[]
}

/**
 * Listener for the DepthOfMarket channel config changes.
 */
export type DXLinkDepthOfMarketConfigChangeListener = (config: DepthOfMarketConfig) => void

/**
 * Listener for the DepthOfMarket channel snapshot received from the channel.
 */
export type DXLinkDepthOfMarketSnapshotListener = (
  time: number,
  bids: DepthOfMarketOrder[],
  asks: DepthOfMarketOrder[]
) => void

/**
 * dxLink DepthOfMarket service instance for the specified symbol and sources.
 */
export interface DXLinkDepthOfMarketRequester {
  /**
   * Unique identifier of the DepthOfMarket channel.
   */
  readonly id: number
  /**
   * Symbol of the DepthOfMarket channel.
   */
  readonly symbol: string
  /**
   * Sources of the DepthOfMarket channel.
   */
  readonly sources: string[]

  /**
   * Get current channel of the DepthOfMarket.
   * Note: inaproppriate usage of the channel can lead to unexpected behavior.
   * @see {DXLinkChannel}
   */
  getChannel(): DXLinkChannel

  /**
   * Configure desired configuration of the DepthOfMarket channel.
   * @see {DepthOfMarketAcceptConfig}
   */
  configure(acceptConfig: DepthOfMarketAcceptConfig): void

  /**
   * Get current configuration of the DepthOfMarket channel as received from the channel.
   */
  getConfig(): DepthOfMarketConfig
  /**
   * Add a listener for the DepthOfMarket channel config changes.
   */
  addConfigChangeListener(listener: DXLinkDepthOfMarketConfigChangeListener): void
  /**
   * Remove a listener for the DepthOfMarket channel config changes.
   */
  removeConfigChangeListener(listener: DXLinkDepthOfMarketConfigChangeListener): void

  /**
   * Add a listener for the DepthOfMarket channel events received from the channel.
   */
  addSnapshotListener(listener: DXLinkDepthOfMarketSnapshotListener): void
  /**
   * Remove a listener for the DepthOfMarket channel events received from the channel.
   */
  removeSnapshotListener(listener: DXLinkDepthOfMarketSnapshotListener): void

  /**
   * Close the DepthOfMarket channel.
   */
  close(): void
}

/**
 * Options for the {@link DXLinkDepthOfMarket} instance.
 */
export interface DXLinkDepthOfMarketOptions {
    /**
   * Space to be used for the service.
   */
  space?: string
  /**
   * Feed name to be used for the service.
   */
  feed?: string
  /**
   * Log level for the DepthOfMarket.
   */
  logLevel: DXLinkLogLevel
}

const DEPTH_OF_MARKET_SERVICE_NAME = 'DOM'

/**
 * dxLink Depth Of Market provides access to the depth of market service
 */
export class DXLinkDepthOfMarket implements DXLinkDepthOfMarketRequester {
  /**
   * Unique identifier of the DepthOfMarket channel.
   */
  public readonly id: number
  /**
   * Symbol of the DepthOfMarket channel.
   */
  public readonly symbol: string
  /**
   * Sources of the DepthOfMarket channel.
   */
  public readonly sources: string[]

  private readonly options: DXLinkDepthOfMarketOptions

  /**
   * dxLink channel instance.
   */
  private readonly channel: DXLinkChannel

  /**
   * Current accept config of the DepthOfMarket channel.
   */
  private acceptConfig: DepthOfMarketAcceptConfig = {}

  /**
   * Current config of the DepthOfMarket channel.
   */
  private config: DepthOfMarketConfig = {
    aggregationPeriod: NaN,
    dataFormat: DepthOfMarketDataFormat.FULL,
    depthLimit: NaN,
    orderFields: [],
  }

  // Listeners
  private readonly configListeners = new Set<DXLinkDepthOfMarketConfigChangeListener>()
  private readonly snapshotListeners = new Set<DXLinkDepthOfMarketSnapshotListener>()

  private readonly logger: DXLinkLogger

  /**
   * Allows to create {@link DXLinkDepthOfMarket} instance with the specified {@link DepthOfMarketContract} for the given {@link DXLinkWebSocketClient}.
   */
  constructor(
    client: DXLinkClient,
    parameters: DepthOfMarketParameters,
    options: Partial<DXLinkDepthOfMarketOptions> = {}
  ) {
    this.options = {
      logLevel: DXLinkLogLevel.WARN,
      ...options,
    }

    this.channel = client.openChannel(DEPTH_OF_MARKET_SERVICE_NAME, {
      symbol: parameters.symbol,
      sources: parameters.sources,
      // Optional parameters for FEED source
      space: options.space,
      feed: options.feed,
    })
    this.id = this.channel.id
    this.symbol = parameters.symbol
    this.sources = parameters.sources
    this.channel.addMessageListener(this.processMessage)
    this.channel.addStateChangeListener(this.processStatus)
    this.channel.addErrorListener(this.processError)

    this.logger = new Logger(`${DXLinkDepthOfMarket.name}#${this.id}`, this.options.logLevel)
  }

  getChannel = () => this.channel

  getState = () => this.channel.getState()
  addStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.addStateChangeListener(listener)
  removeStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.removeStateChangeListener(listener)

  getConfig = () => this.config
  addConfigChangeListener = (listener: DXLinkDepthOfMarketConfigChangeListener) => {
    this.configListeners.add(listener)
  }
  removeConfigChangeListener = (listener: DXLinkDepthOfMarketConfigChangeListener) => {
    this.configListeners.delete(listener)
  }

  close = () => {
    this.acceptConfig = {}

    this.configListeners.clear()
    this.snapshotListeners.clear()

    this.channel.close()
  }

  configure = (acceptConfig: DepthOfMarketAcceptConfig) => {
    this.acceptConfig = acceptConfig

    if (this.channel.getState() === DXLinkChannelState.OPENED) {
      this.channel.send({
        type: 'DOM_SETUP',
        ...acceptConfig,
      } satisfies DepthOfMarketSetupMessage)
    }
  }

  addSnapshotListener = (listener: DXLinkDepthOfMarketSnapshotListener) => {
    this.snapshotListeners.add(listener)
  }
  removeSnapshotListener = (listener: DXLinkDepthOfMarketSnapshotListener) => {
    this.snapshotListeners.delete(listener)
  }

  /**
   * Process message received in the channel.
   */
  private processMessage = (message: DXLinkChannelMessage) => {
    // Parse message
    if (isDepthOfMarketMessage(message)) {
      switch (message.type) {
        case 'DOM_CONFIG':
          this.processConfig(message)
          return
        case 'DOM_SNAPSHOT':
          this.processSnapshot(message)
          return
      }
    }

    this.logger.warn('Unknown message', message)
  }

  /**
   * Process config received from the channel.
   */
  private processConfig = (config: DepthOfMarketConfigMessage) => {
    // Update config with the new values from the channel
    const newConfig: DepthOfMarketConfig = {
      aggregationPeriod: config.aggregationPeriod ?? this.config.aggregationPeriod,
      depthLimit: config.depthLimit ?? this.config.depthLimit,
      dataFormat: config.dataFormat ?? this.config.dataFormat,
      orderFields: config.orderFields ?? this.config.orderFields,
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
   * Process data received from the channel.
   */
  private processSnapshot = (snapshot: DepthOfMarketSnapshotMessage) => {
    // Notify listeners
    for (const listener of this.snapshotListeners) {
      try {
        listener(snapshot.time, snapshot.bids, snapshot.asks)
      } catch (error) {
        this.logger.error('Error in snapshot listener', error)
      }
    }
  }

  /**
   * Process channel status changes from the channel.
   */
  private processStatus = (processStatus: DXLinkChannelState) => {
    switch (processStatus) {
      case DXLinkChannelState.OPENED: {
        return this.reconfigure()
      }
      case DXLinkChannelState.REQUESTED: {
        return
      }
      case DXLinkChannelState.CLOSED:
        // Destroy the channel if it is closed by the channel
        return this.close()
    }
  }

  /**
   * Process error received from the channel.
   */
  private processError = (processError: DXLinkError) => {
    this.logger.error('Error in channel', processError)
  }

  /**
   * Reconfigure the DepthOfMarket channel after the channel re-open.
   */
  private reconfigure() {
    this.channel.send({
      type: 'DOM_SETUP',
      ...this.acceptConfig,
    } satisfies DepthOfMarketSetupMessage)
  }
}
