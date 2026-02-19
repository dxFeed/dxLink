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
  type DXLinkIndiChartUpdateMessage,
  type DXLinkIndiChartCandleSnapshotMessage,
  type DXLinkIndiChartIndicatorsSnapshotMessage,
  type DXLinkIndiChartIndicators,
  type DXLinkIndiChartIndicatorsParameters,
  type DXLinkIndiChartIndicatorsData,
  type DXLinkIndiChartSetup,
  type DXLinkIndiChartSetupMessage,
  type DXLinkIndiChartSubscription,
  type DXLinkIndiChartSubscriptionMessage,
  type DXLinkIndiChartIndicatorsStates,
} from './messages'

// Listener for data updates (INDICHART_UPDATE) - no reset flag, reset is only in INDICHART_CANDLE_SNAPSHOT
export type DXLinkIndiChartUpdateListener = (
  candles: DXLinkIndiChartCandle[],
  indicators: DXLinkIndiChartIndicatorsData,
  pending: boolean
) => void

// Listener for candle snapshots (INDICHART_CANDLE_SNAPSHOT)
export type DXLinkIndiChartCandleSnapshotListener = (
  candles: DXLinkIndiChartCandle[],
  reset: boolean,
  pending: boolean
) => void

// Listener for indicator snapshots (INDICHART_INDICATORS_SNAPSHOT)
export type DXLinkIndiChartIndicatorsSnapshotListener = (
  indicators: DXLinkIndiChartIndicatorsData,
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
   * Add a listener for the Chart data updates (INDICHART_UPDATE).
   */
  addUpdateListener(listener: DXLinkIndiChartUpdateListener): void
  /**
   * Remove a listener for the Chart data updates.
   */
  removeUpdateListener(listener: DXLinkIndiChartUpdateListener): void

  /**
   * Add a listener for the Chart candle snapshots (INDICHART_CANDLE_SNAPSHOT).
   */
  addCandleSnapshotListener(listener: DXLinkIndiChartCandleSnapshotListener): void
  /**
   * Remove a listener for the Chart candle snapshots.
   */
  removeCandleSnapshotListener(listener: DXLinkIndiChartCandleSnapshotListener): void

  /**
   * Add a listener for the Chart indicator snapshots (INDICHART_INDICATORS_SNAPSHOT).
   */
  addIndicatorsSnapshotListener(listener: DXLinkIndiChartIndicatorsSnapshotListener): void
  /**
   * Remove a listener for the Chart indicator snapshots.
   */
  removeIndicatorsSnapshotListener(listener: DXLinkIndiChartIndicatorsSnapshotListener): void

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

  private readonly updateListeners = new Set<DXLinkIndiChartUpdateListener>()
  private readonly candleSnapshotListeners = new Set<DXLinkIndiChartCandleSnapshotListener>()
  private readonly indicatorsSnapshotListeners =
    new Set<DXLinkIndiChartIndicatorsSnapshotListener>()
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
    this.updateListeners.clear()
    this.candleSnapshotListeners.clear()
    this.indicatorsSnapshotListeners.clear()

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

  addUpdateListener = (listener: DXLinkIndiChartUpdateListener) => {
    this.updateListeners.add(listener)
  }
  removeUpdateListener = (listener: DXLinkIndiChartUpdateListener) => {
    this.updateListeners.delete(listener)
  }

  addCandleSnapshotListener = (listener: DXLinkIndiChartCandleSnapshotListener) => {
    this.candleSnapshotListeners.add(listener)
  }
  removeCandleSnapshotListener = (listener: DXLinkIndiChartCandleSnapshotListener) => {
    this.candleSnapshotListeners.delete(listener)
  }

  addIndicatorsSnapshotListener = (listener: DXLinkIndiChartIndicatorsSnapshotListener) => {
    this.indicatorsSnapshotListeners.add(listener)
  }
  removeIndicatorsSnapshotListener = (listener: DXLinkIndiChartIndicatorsSnapshotListener) => {
    this.indicatorsSnapshotListeners.delete(listener)
  }

  /**
   * Process message received in the channel.
   */
  private processMessage = (message: DXLinkChannelMessage) => {
    // Parse message
    if (isChartInboundMessage(message)) {
      switch (message.type) {
        case 'INDICHART_UPDATE':
          return this.processUpdate(message)
        case 'INDICHART_CANDLE_SNAPSHOT':
          return this.processCandleSnapshot(message)
        case 'INDICHART_INDICATORS_SNAPSHOT':
          return this.processIndicatorsSnapshot(message)
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
   * Process data updates received from the channel.
   */
  private processUpdate = (message: DXLinkIndiChartUpdateMessage) => {
    for (const listener of this.updateListeners) {
      try {
        const { pending, candles, indicators } = message
        listener(candles, indicators, Boolean(pending))
      } catch (error) {
        this.logger.error('Error in update listener', error)
      }
    }
  }

  /**
   * Process candle snapshot received from the channel.
   */
  private processCandleSnapshot = (message: DXLinkIndiChartCandleSnapshotMessage) => {
    for (const listener of this.candleSnapshotListeners) {
      try {
        const { reset, pending, candles } = message
        listener(candles, Boolean(reset), Boolean(pending))
      } catch (error) {
        this.logger.error('Error in candle snapshot listener', error)
      }
    }
  }

  /**
   * Process indicators snapshot received from the channel.
   */
  private processIndicatorsSnapshot = (message: DXLinkIndiChartIndicatorsSnapshotMessage) => {
    for (const listener of this.indicatorsSnapshotListeners) {
      try {
        const { pending, indicators } = message
        listener(indicators, Boolean(pending))
      } catch (error) {
        this.logger.error('Error in indicators snapshot listener', error)
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

  /**
   * Updates the indicators parameters without changing the subscription.
   * @param indicatorsParameters New indicators parameters.
   */
  public updateIndicatorsParameters = (
    indicatorsParameters: DXLinkIndiChartIndicatorsParameters
  ) => {
    console.log('Updating indi params', indicatorsParameters)
    if (this.lastSubscriptionState) {
      this.lastSubscriptionState = {
        ...this.lastSubscriptionState,
        indicatorsParameters,
      }

      if (this.channel.getState() === DXLinkChannelState.OPENED) {
        this.channel.send({
          type: 'INDICHART_SUBSCRIPTION',
          ...this.lastSubscriptionState,
        } satisfies DXLinkIndiChartSubscriptionMessage)
      }
    } else {
      this.logger.warn('Cannot update indicators parameters, subscription is not set')
    }
  }
}
