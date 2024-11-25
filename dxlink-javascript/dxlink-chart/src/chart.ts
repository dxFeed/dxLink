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
  type DXLinkChartCandle,
  type DXLinkChartConfig,
  type DXLinkChartDataMessage,
  type DXLinkChartIndicators,
  type DXLinkChartIndicatorsParameters,
  type DXLinkChartIndicatorsData,
  type DXLinkChartSetup,
  type DXLinkChartSetupMessage,
  type DXLinkChartSubscription,
  type DXLinkChartSubscriptionMessage,
  type DXLinkChartIndicatorsStates,
} from './messages'

export type DXLinkChartDataListener = (
  candles: DXLinkChartCandle[],
  indicators: DXLinkChartIndicatorsData,
  reset: boolean,
  pending: boolean
) => void

export type DXLinkChartIndicatorsStateListener = (indicators: DXLinkChartIndicatorsStates) => void

/**
 * dxLink Chart service.
 */
export interface DXLinkChartRequester {
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
    subscription: DXLinkChartSubscription,
    indicatorsParameters: DXLinkChartIndicatorsParameters
  ): void

  setup(setup: DXLinkChartSetup): void

  getConfig(): DXLinkChartConfig | null

  getIndicators(): DXLinkChartIndicatorsStates | null

  /**
   * Add a listener for the Chart channel events received from the channel.
   */
  addDataListener(listener: DXLinkChartDataListener): void
  /**
   * Remove a listener for the Chart channel events received from the channel.
   */
  removeDataListener(listener: DXLinkChartDataListener): void

  /**
   * Add a listener for the Chart indicators state changes received from the channel.
   */
  addIndicatorsStateChangeListener(listener: DXLinkChartIndicatorsStateListener): void
  /**
   * Remove a listener for the Chart indicators state changes received from the channel.
   */
  removeIndicatorsStateChangeListener(listener: DXLinkChartIndicatorsStateListener): void

  /**
   * Close the Chart channel.
   */
  close(): void
}

/**
 * Options for the {@link DXLinkChart} instance.
 */
export interface DXLinkChartOptions {
  /**
   * Log level for the Chart.
   */
  logLevel: DXLinkLogLevel
}

const CHART_SERVICE_NAME = 'CHART'

/**
 * dxLink Chart service implementation.
 */
export class DXLinkChart implements DXLinkChartRequester {
  /**
   * Unique identifier of the Chart channel.
   */
  public readonly id: number

  private readonly dataListeners = new Set<DXLinkChartDataListener>()
  private readonly indicatorsStateListeners = new Set<DXLinkChartIndicatorsStateListener>()

  private readonly logger: DXLinkLogger
  private readonly channel: DXLinkChannel

  private lastSubscription: {
    subscription: DXLinkChartSubscription
    indicatorsParameters: DXLinkChartIndicatorsParameters
  } | null = null
  private lastSetup: DXLinkChartSetup | null = null
  private lastConfig: DXLinkChartConfig | null = null

  private indicators: DXLinkChartIndicatorsStates | null = null

  /**
   * Allows to create {@link DXLinkChart} instance with the specified {@link ChartContract} for the given {@link DXLinkWebSocketClient}.
   */
  constructor(client: DXLinkClient, indicators: DXLinkChartIndicators) {
    this.channel = client.openChannel(CHART_SERVICE_NAME, {
      indicators,
    })
    this.id = this.channel.id
    this.channel.addMessageListener(this.processMessage)
    this.channel.addStateChangeListener(this.processStatus)
    this.channel.addErrorListener(this.processError)

    this.logger = new Logger(`${DXLinkChart.name}#${this.id}`, DXLinkLogLevel.WARN)
  }

  getChannel = () => this.channel

  getState = () => this.channel.getState()
  addStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.addStateChangeListener(listener)
  removeStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.removeStateChangeListener(listener)

  addIndicatorsStateChangeListener = (listener: DXLinkChartIndicatorsStateListener) =>
    this.indicatorsStateListeners.add(listener)
  removeIndicatorsStateChangeListener = (listener: DXLinkChartIndicatorsStateListener) =>
    this.indicatorsStateListeners.delete(listener)

  setup = (setup: DXLinkChartSetup) => {
    this.lastSetup = setup

    if (this.channel.getState() === DXLinkChannelState.OPENED) {
      this.channel.send({
        type: 'CHART_SETUP',
        ...setup,
      } satisfies DXLinkChartSetupMessage)
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
    subscription: DXLinkChartSubscription,
    indicatorsParameters: DXLinkChartIndicatorsParameters
  ) => {
    this.lastSubscription = {
      subscription,
      indicatorsParameters,
    }

    if (this.channel.getState() === DXLinkChannelState.OPENED) {
      this.channel.send({
        type: 'CHART_SUBSCRIPTION',
        ...this.lastSubscription,
      } satisfies DXLinkChartSubscriptionMessage)
    }
  }

  removeIndicators = (indicators: string[]) => {
    this.channel.send({
      type: 'CHART_REMOVE_INDICATORS',
      indicators,
    })
  }

  addDataListener = (listener: DXLinkChartDataListener) => {
    this.dataListeners.add(listener)
  }
  removeDataListener = (listener: DXLinkChartDataListener) => {
    this.dataListeners.delete(listener)
  }

  /**
   * Process message received in the channel.
   */
  private processMessage = (message: DXLinkChannelMessage) => {
    // Parse message
    if (isChartInboundMessage(message)) {
      switch (message.type) {
        case 'CHART_DATA':
          this.processData(message)
          return
        case 'CHART_CONFIG': {
          this.lastConfig = message
          return
        }
        case 'CHART_INDICATORS': {
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
  private processData = (message: DXLinkChartDataMessage) => {
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
    if (this.lastSubscription) {
      this.channel.send({
        type: 'CHART_SUBSCRIPTION',
        ...this.lastSubscription,
      } satisfies DXLinkChartSubscriptionMessage)
    }

    if (this.lastSetup) {
      this.channel.send({
        type: 'CHART_SETUP',
        ...this.lastSetup,
      } satisfies DXLinkChartSetupMessage)
    }
  }
}
