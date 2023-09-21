import { DXLinkWebSocketConfig } from './client'
import {
  DXLinkChannel,
  DXLinkChannelMessage,
  DXLinkChannelMessageListener,
  DXLinkChannelState,
  DXLinkChannelStateChangeListener,
  DXLinkError,
  DXLinkErrorListener,
} from './dxlink'
import { DXLinkLogger, Logger } from './logger'
import { ChannelPayloadMessage, Message } from './messages'

export class Channel implements DXLinkChannel {
  private status = DXLinkChannelState.REQUESTED

  // Listeners
  private readonly messageListeners = new Set<DXLinkChannelMessageListener>()
  private readonly statusListeners = new Set<DXLinkChannelStateChangeListener>()
  private readonly errorListeners = new Set<DXLinkErrorListener>()

  private logger: DXLinkLogger

  constructor(
    public readonly id: number,
    public readonly service: string,
    public readonly parameters: Record<string, unknown>,
    private readonly sendMessage: (message: Message) => void,
    config: DXLinkWebSocketConfig
  ) {
    this.logger = new Logger(`${Channel.name}#${id} ${service}`, config.logLevel)
  }

  send = ({ type, ...payload }: DXLinkChannelMessage) => {
    if (this.status !== DXLinkChannelState.OPENED) {
      throw new Error('Channel is not ready')
    }

    this.sendMessage({
      type,
      channel: this.id,
      ...payload,
    })
  }

  addMessageListener = (listener: DXLinkChannelMessageListener) =>
    this.messageListeners.add(listener)
  removeMessageListener = (listener: DXLinkChannelMessageListener) =>
    this.messageListeners.delete(listener)

  getState = () => this.status
  addStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.statusListeners.add(listener)
  removeStateChangeListener = (listener: DXLinkChannelStateChangeListener) =>
    this.statusListeners.delete(listener)

  addErrorListener = (listener: DXLinkErrorListener) => this.errorListeners.add(listener)
  removeErrorListener = (listener: DXLinkErrorListener) => this.errorListeners.delete(listener)

  error = ({ type, message }: DXLinkError) =>
    this.send({
      type: 'ERROR',
      error: type,
      message,
    })

  close = () => {
    if (this.status === DXLinkChannelState.CLOSED) return

    this.logger.debug(`Closing by user`)

    this.send({
      type: 'CHANNEL_CANCEL',
    })

    this.clear()

    // After sending CHANNEL_CANCEL we can think that channel is closed already
    this.setStatus(DXLinkChannelState.CLOSED)
  }

  request = () => {
    this.logger.debug('Requesting')

    this.sendMessage({
      type: 'CHANNEL_REQUEST',
      channel: this.id,
      service: this.service,
      parameters: this.parameters,
    })

    this.processStatusRequested()
  }

  processPayloadMessage = (message: ChannelPayloadMessage) => {
    for (const listener of this.messageListeners) {
      listener(message)
    }
  }

  processStatusOpened = () => {
    this.logger.debug('Opened')

    this.setStatus(DXLinkChannelState.OPENED)
  }

  processStatusRequested = () => {
    this.logger.debug('Requested')

    this.setStatus(DXLinkChannelState.REQUESTED)
  }

  processStatusClosed = () => {
    this.logger.debug('Closed by remote endpoint')

    this.setStatus(DXLinkChannelState.CLOSED)
    this.clear()
  }

  processError = (error: DXLinkError) => {
    if (this.errorListeners.size === 0) {
      console.error(`Unhandled error in channel#${this.id}: `, error)
      return
    }

    for (const listener of this.errorListeners) {
      try {
        listener(error)
      } catch (e) {
        console.error(`Error in channel#${this.id} error listener: `, e)
      }
    }
  }

  private setStatus = (newStatus: DXLinkChannelState) => {
    if (this.status === newStatus) return

    const prev = this.status
    this.status = newStatus
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus, prev)
      } catch (e) {
        console.error(`Error in channel#${this.id} status listener: `, e)
      }
    }
  }

  private clear = () => {
    this.messageListeners.clear()
    this.statusListeners.clear()
    this.errorListeners.clear()
  }
}
