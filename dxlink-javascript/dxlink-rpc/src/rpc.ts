import {
  type DXLinkChannel,
  type DXLinkChannelMessage,
  DXLinkChannelState,
  type DXLinkClient,
  type DXLinkError,
  DXLinkLogLevel,
  type DXLinkLogger,
  Logger,
} from '@dxfeed/dxlink-core'
import { Observable, of, type Subscription } from 'rxjs'

import { type ChannelDataMessage, isChannelDataMessage } from './types'

/**
 * Options for the {@link DxLinkRpcService} instance.
 */
export interface DxLinkRpcServiceOptions {
  /**
   * Log level for the RPC service.
   */
  logLevel: DXLinkLogLevel
}

/**
 * dxLink RPC service that provides RPC-over-channel utilities using rxjs Observable.
 *
 * Each method call opens a dedicated channel by sending CHANNEL_REQUEST with the service name
 * and `methodName` in parameters. The server uses `service` to route to the RPC handler,
 * and `methodName` to select which method to invoke.
 *
 * Data exchange happens via CHANNEL_DATA messages on the opened channel.
 * The server confirms the channel with CHANNEL_OPENED before data can flow.
 * The server may send ERROR messages (e.g. INVALID_MESSAGE, BAD_ACTION, UNAUTHORIZED)
 * before CHANNEL_CLOSED to explain why the channel is ending.
 *
 * Interaction styles:
 * - {@link requestResponse} — unary: one request, one response, channel closed after reply.
 * - {@link requestStream} — server-streaming: one request, multiple responses until CHANNEL_CLOSED.
 * - {@link streamStream} — bidirectional: Observable input stream, Observable output stream.
 *
 * Unsubscribing from the output Observable sends CHANNEL_CANCEL to abort the RPC.
 * On connection drop, channels re-enter REQUESTED state and re-open automatically.
 */
export class DxLinkRpcService {
  private readonly options: DxLinkRpcServiceOptions
  private readonly logger: DXLinkLogger

  constructor(
    private readonly client: DXLinkClient,
    private readonly service: string,
    options: Partial<DxLinkRpcServiceOptions> = {}
  ) {
    this.options = {
      logLevel: DXLinkLogLevel.WARN,
      ...options,
    }
    this.logger = new Logger(`${DxLinkRpcService.name} ${service}`, this.options.logLevel)
  }

  /**
   * Bidirectional streaming RPC: Observable input stream, Observable output stream.
   *
   * @param method - RPC method name.
   * @param input$ - Observable stream of request payloads to send to the server.
   * @returns Observable stream of response payloads from the server.
   */
  streamStream<Request, Response>(
    method: string,
    input$: Observable<Request>
  ): Observable<Response> {
    return new Observable<Response>((subscriber) => {
      // Opens a dedicated channel by sending CHANNEL_REQUEST with the service name
      // and methodName in parameters. The server uses `service` to route to the RPC handler,
      // and `methodName` to select which method to invoke.
      const channel: DXLinkChannel = this.client.openChannel(this.service, {
        methodName: method,
      })

      let inputSubscription: Subscription | undefined

      const subscribeToInput = () => {
        if (inputSubscription !== undefined) return

        inputSubscription = input$.subscribe({
          next: (value) => {
            // CHANNEL_DATA can only be sent after the server confirms the channel
            // with CHANNEL_OPENED. Before that the channel is in REQUESTED state.
            if (channel.getState() === DXLinkChannelState.OPENED) {
              try {
                const message: ChannelDataMessage<Request> = {
                  type: 'CHANNEL_DATA',
                  payload: value,
                }
                channel.send(message)
              } catch (err) {
                subscriber.error(err)
              }
            }
          },
          error: (err) => {
            subscriber.error(err)
            channel.close()
          },
        })
      }

      const unsubscribeFromInput = () => {
        inputSubscription?.unsubscribe()
        inputSubscription = undefined
      }

      // Server responses arrive as CHANNEL_DATA messages on the same channel id.
      // Each payload is extracted and emitted on the output Observable.
      const messageListener = (message: DXLinkChannelMessage) => {
        if (isChannelDataMessage(message)) {
          subscriber.next(message.payload as Response)
        } else {
          this.logger.warn('Unknown message', message)
        }
      }
      channel.addMessageListener(messageListener)

      const stateListener = (state: DXLinkChannelState) => {
        switch (state) {
          // Server confirmed the channel with CHANNEL_OPENED — ready to exchange CHANNEL_DATA.
          case DXLinkChannelState.OPENED:
            subscribeToInput()
            break
          // Channel is re-requesting after a connection drop.
          // Input is unsubscribed; will re-subscribe on next OPENED.
          case DXLinkChannelState.REQUESTED:
            unsubscribeFromInput()
            break
          // Server sent CHANNEL_CLOSED — the RPC for this channel id is finished.
          // The channel id must not be reused; the output Observable completes.
          case DXLinkChannelState.CLOSED:
            unsubscribeFromInput()
            subscriber.complete()
            break
        }
      }
      channel.addStateChangeListener(stateListener)

      // The server may send ERROR messages before CHANNEL_CLOSED to explain why the channel
      // is ending (e.g. INVALID_MESSAGE, BAD_ACTION, UNAUTHORIZED).
      // Errors arriving after CLOSED are logged but not forwarded — the stream is already done.
      const errorListener = (error: DXLinkError) => {
        if (channel.getState() === DXLinkChannelState.CLOSED) {
          this.logger.warn('Error received after channel closed', error)
          return
        }
        subscriber.error(error)
      }
      channel.addErrorListener(errorListener)

      // The channel implementation may not fire the state listener synchronously on add,
      // so check if the channel is already OPENED to avoid missing the initial state.
      if (channel.getState() === DXLinkChannelState.OPENED) {
        subscribeToInput()
      }

      // Teardown: sends CHANNEL_CANCEL to the server, telling it to abort the RPC.
      // The server should respond with CHANNEL_CLOSED to retire the channel id.
      // channel.close() is idempotent — safe to call even if already closed.
      return () => {
        unsubscribeFromInput()
        channel.removeMessageListener(messageListener)
        channel.removeStateChangeListener(stateListener)
        channel.removeErrorListener(errorListener)
        channel.close()
      }
    })
  }

  /**
   * Unary RPC: send one request, receive one response.
   *
   * @param method - RPC method name.
   * @param request - Single request payload to send to the server.
   * @returns Observable that emits one response value and completes.
   */
  requestResponse<Request, Response>(method: string, request: Request): Observable<Response> {
    // The server sends one response and then CHANNEL_CLOSED — no need for client-side take(1).
    return this.streamStream<Request, Response>(method, of(request))
  }

  /**
   * Server-streaming RPC: send one request, receive a stream of responses.
   *
   * @param method - RPC method name.
   * @param request - Single request payload to send to the server.
   * @returns Observable stream of response payloads, completes when the server closes the channel.
   */
  requestStream<Request, Response>(method: string, request: Request): Observable<Response> {
    // The channel stays open for receiving until the server sends CHANNEL_CLOSED.
    return this.streamStream<Request, Response>(method, of(request))
  }
}
