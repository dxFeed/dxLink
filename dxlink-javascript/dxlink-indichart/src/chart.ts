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
  isChartInboundMessage,
  type DXLinkIndiChartCandle,
  type DXLinkIndiChartConfig,
  type DXLinkIndiChartDataMessage,
  type DXLinkIndiChartIndicators,
  type DXLinkIndiChartIndicatorsParameters,
  type DXLinkIndiChartIndicatorsData,
  type DXLinkIndiChartSetup,
  type DXLinkIndiChartSetupMessage,
  type DXLinkIndiChartSubscription,
  type DXLinkIndiChartSubscriptionMessage,
  type DXLinkIndiChartIndicatorsStates,
} from './messages'

export type DXLinkIndiChartDataListener = (
  candles: DXLinkIndiChartCandle[],
  indicators: DXLinkIndiChartIndicatorsData,
  reset: boolean,
  pending: boolean
) => void

export type DXLinkIndiChartIndicatorsStateListener = (
  indicators: DXLinkIndiChartIndicatorsStates
) => void

export interface DXLinkIndiChartSubscriptionState {
  subscription: DXLinkIndiChartSubscription
  indicatorsParameters: DXLinkIndiChartIndicatorsParameters
}

/**
 * dxLink Chart service.
 */
export interface DXLinkIndiChartRequester {
  /**
   * Unique identifier of the Chart channel.
   */
  readonly id: number

  /**
   * Get current channel of the Chart.
   * Note: inaproppriate usage of the channel can lead to unexpected behavior.
   * @see {DXLinkChannel}
   */
  getChannel(): DXLinkChannel

  setSubscription(
    subscription: DXLinkIndiChartSubscription,
    indicatorsParameters: DXLinkIndiChartIndicatorsParameters
  ): void

  getSubscription(): DXLinkIndiChartSubscriptionState | null

  setup(setup: DXLinkIndiChartSetup): void

  getConfig(): DXLinkIndiChartConfig | null

  getIndicators(): DXLinkIndiChartIndicatorsStates | null

  /**
   * Add a listener for the Chart channel events received from the channel.
   */
  addDataListener(listener: DXLinkIndiChartDataListener): void
  /**
   * Remove a listener for the Chart channel events received from the channel.
   */
  removeDataListener(listener: DXLinkIndiChartDataListener): void

  /**
   * Add a listener for the Chart indicators state changes received from the channel.
   */
  addIndicatorsStateChangeListener(listener: DXLinkIndiChartIndicatorsStateListener): void
  /**
   * Remove a listener for the Chart indicators state changes received from the channel.
   */
  removeIndicatorsStateChangeListener(listener: DXLinkIndiChartIndicatorsStateListener): void

  /**
   * Close the Chart channel.
   */
  close(): void
}

/**
 * Options for the {@link DXLinkIndiChart} instance.
 */
export interface DXLinkIndiChartOptions {
  /**
   * Log level for the Chart.
   */
  logLevel: DXLinkLogLevel
}

const SERVICE_NAME = 'INDICHART'

/**
 * dxLink Indi Chart service implementation.
 */
export class DXLinkIndiChart implements DXLinkIndiChartRequester {
  /**
   * Unique identifier of the Chart channel.
   */
  public readonly id: number

  private readonly dataListeners = new Set<DXLinkIndiChartDataListener>()
  private readonly indicatorsStateListeners = new Set<DXLinkIndiChartIndicatorsStateListener>()

  private readonly logger: DXLinkLogger
  private readonly channel: DXLinkChannel

  private lastSubscriptionState: DXLinkIndiChartSubscriptionState | null = null
  private lastSetup: DXLinkIndiChartSetup | null = null
  private lastConfig: DXLinkIndiChartConfig | null = null

  private indicators: DXLinkIndiChartIndicatorsStates | null = null

  /**
   * Allows to create {@link DXLinkIndiChart} instance with the specified {@link ChartContract} for the given {@link DXLinkWebSocketClient}.
   */
  constructor(client: DXLinkClient, indicators: DXLinkIndiChartIndicators) {
    this.channel = client.openChannel(SERVICE_NAME, {
      indicators,
    })
    this.id = this.channel.id
    this.channel.addMessageListener(this.processMessage)
    this.channel.addStateChangeListener(this.processStatus)
    this.channel.addErrorListener(this.processError)

    this.logger = new Logger(`${DXLinkIndiChart.name}#${this.id}`, DXLinkLogLevel.WARN)
  }

  getChannel = () => this.channel

  getState = () => this.channel.getState()
  addStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.addStateChangeListener(listener)
  removeStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.removeStateChangeListener(listener)

  addIndicatorsStateChangeListener = (listener: DXLinkIndiChartIndicatorsStateListener) =>
    this.indicatorsStateListeners.add(listener)
  removeIndicatorsStateChangeListener = (listener: DXLinkIndiChartIndicatorsStateListener) =>
    this.indicatorsStateListeners.delete(listener)

  setup = (setup: DXLinkIndiChartSetup) => {
    this.lastSetup = setup

    if (this.channel.getState() === DXLinkChannelState.OPENED) {
      this.channel.send({
        type: 'INDICHART_SETUP',
        ...setup,
      } satisfies DXLinkIndiChartSetupMessage)
    }
  }

  getConfig = () => this.lastConfig

  getIndicators = () => this.indicators

  close = () => {
    this.lastSetup = null
    this.dataListeners.clear()

    this.channel.close()
  }

  setSubscription = (
    subscription: DXLinkIndiChartSubscription,
    indicatorsParameters: DXLinkIndiChartIndicatorsParameters
  ) => {
    this.lastSubscriptionState = {
      subscription,
      indicatorsParameters,
    }

    if (this.channel.getState() === DXLinkChannelState.OPENED) {
      this.channel.send({
        type: 'INDICHART_SUBSCRIPTION',
        ...this.lastSubscriptionState,
      } satisfies DXLinkIndiChartSubscriptionMessage)
    }
  }

  getSubscription = () => this.lastSubscriptionState

  removeIndicators = (indicators: string[]) => {
    this.channel.send({
      type: 'INDICHART_REMOVE_INDICATORS',
      indicators,
    })
  }

  addDataListener = (listener: DXLinkIndiChartDataListener) => {
    this.dataListeners.add(listener)
  }
  removeDataListener = (listener: DXLinkIndiChartDataListener) => {
    this.dataListeners.delete(listener)
  }

  /**
   * Process message received in the channel.
   */
  private processMessage = (message: DXLinkChannelMessage) => {
    // Parse message
    if (isChartInboundMessage(message)) {
      switch (message.type) {
        case 'INDICHART_DATA':
          this.processData(message)
          return
        case 'INDICHART_CONFIG': {
          this.lastConfig = message
          return
        }
        case 'INDICHART_INDICATORS': {
          const indicators = message.indicators

          if (this.indicators !== indicators) {
            this.indicators = indicators

            for (const listener of this.indicatorsStateListeners) {
              listener(this.indicators)
            }
          }
          return
        }
      }
    }

    this.logger.warn('Unknown message', message)
  }

  /**
   * Process data received from the channel.
   */
  private processData = (message: DXLinkIndiChartDataMessage) => {
    // Notify listeners
    for (const listener of this.dataListeners) {
      try {
        const { reset, pending, candles, indicators } = message

        listener(candles, indicators, Boolean(reset), Boolean(pending))
      } catch (error) {
        this.logger.error('Error in data listener', error)
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
   * Reconfigure the CHART channel after the channel re-open.
   */
  private reconfigure() {
    if (this.lastSubscriptionState) {
      this.channel.send({
        type: 'INDICHART_SUBSCRIPTION',
        ...this.lastSubscriptionState,
      } satisfies DXLinkIndiChartSubscriptionMessage)
    }

    if (this.lastSetup) {
      this.channel.send({
        type: 'INDICHART_SETUP',
        ...this.lastSetup,
      } satisfies DXLinkIndiChartSetupMessage)
    }
  }
}
