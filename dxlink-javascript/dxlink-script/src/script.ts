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
  isScriptMessage,
  type ScriptDataMessage,
  type ScriptSetupMessage,
  type DXLinkScriptCandle,
  type ScriptSubscription,
  type ScriptSetup,
} from './messages'

export type DXLinkScriptDataListener = (events: DXLinkScriptCandle[]) => void

/**
 * dxLink Script service instance for the specified symbol and sources.
 */
export interface DXLinkScriptRequester {
  /**
   * Unique identifier of the DepthOfMarket channel.
   */
  readonly id: number

  /**
   * Get current channel of the DepthOfMarket.
   * Note: inaproppriate usage of the channel can lead to unexpected behavior.
   * @see {DXLinkChannel}
   */
  getChannel(): DXLinkChannel

  set(subscription: ScriptSubscription, script: string): void

  /**
   * Add a listener for the DepthOfMarket channel events received from the channel.
   */
  addDataListener(listener: DXLinkScriptDataListener): void
  /**
   * Remove a listener for the DepthOfMarket channel events received from the channel.
   */
  addDataListener(listener: DXLinkScriptDataListener): void

  /**
   * Close the DepthOfMarket channel.
   */
  close(): void
}

/**
 * Options for the {@link DXLinkScript} instance.
 */
export interface DXLinkScriptOptions {
  /**
   * Log level for the DepthOfMarket.
   */
  logLevel: DXLinkLogLevel
}

const SCRIPT_SERVICE_NAME = 'SCRIPT'

/**
 * dxLink Script
 */
export class DXLinkScript {
  /**
   * Unique identifier of the DepthOfMarket channel.
   */
  public readonly id: number

  private readonly dataListeners = new Set<DXLinkScriptDataListener>()

  private readonly logger: DXLinkLogger

  private readonly channel: DXLinkChannel

  private lastSetup: ScriptSetup | null = null

  /**
   * Allows to create {@link DXLinkDepthOfMarket} instance with the specified {@link DepthOfMarketContract} for the given {@link DXLinkWebSocketClient}.
   */
  constructor(client: DXLinkClient) {
    this.channel = client.openChannel(SCRIPT_SERVICE_NAME, {})
    this.id = this.channel.id
    this.channel.addMessageListener(this.processMessage)
    this.channel.addStateChangeListener(this.processStatus)
    this.channel.addErrorListener(this.processError)

    this.logger = new Logger(`${DXLinkScript.name}#${this.id}`, DXLinkLogLevel.WARN)
  }

  getChannel = () => this.channel

  getState = () => this.channel.getState()
  addStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.addStateChangeListener(listener)
  removeStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.channel.removeStateChangeListener(listener)

  close = () => {
    this.lastSetup = null
    this.dataListeners.clear()

    this.channel.close()
  }

  set = (subscription: ScriptSubscription, script: string) => {
    this.lastSetup = {
      subscription,
      script,
    }

    this.channel.send({
      type: 'SCRIPT_SETUP',
      ...this.lastSetup,
    } satisfies ScriptSetupMessage)
  }

  addDataListener = (listener: DXLinkScriptDataListener) => {
    this.dataListeners.add(listener)
  }
  removeDataListener = (listener: DXLinkScriptDataListener) => {
    this.dataListeners.delete(listener)
  }

  /**
   * Process message received in the channel.
   */
  private processMessage = (message: DXLinkChannelMessage) => {
    // Parse message
    if (isScriptMessage(message)) {
      switch (message.type) {
        case 'SCRIPT_DATA':
          this.processData(message)
          return
      }
    }

    this.logger.warn('Unknown message', message)
  }

  /**
   * Process data received from the channel.
   */
  private processData = (message: ScriptDataMessage) => {
    // Notify listeners
    for (const listener of this.dataListeners) {
      try {
        listener(message.data)
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
   * Reconfigure the SCRIPT channel after the channel re-open.
   */
  private reconfigure() {
    if (this.lastSetup === null) return

    this.channel.send({
      type: 'SCRIPT_SETUP',
      ...this.lastSetup,
    } satisfies ScriptSetupMessage)
  }
}
