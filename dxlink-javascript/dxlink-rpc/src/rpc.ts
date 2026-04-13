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

import { CHANNEL_DATA_TYPE, isChannelDataMessage } from './types'

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
 * Per-call options for {@link DxLinkRpcService.requestResponse} and {@link DxLinkRpcService.requestStream}.
 */
export interface DxLinkRpcCallOptions {
  /**
   * Whether to automatically retry the RPC call after a connection drop.
   * When `true`, the channel is re-requested on reconnect and the same request is re-sent.
   * When `false`, the channel transitions to CLOSED on disconnect and the output Observable completes.
   * @default false
   */
  retry?: boolean
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
   * Retry on connection drop is not supported for this method — the input stream is owned by
   * the caller, so re-sending past values is not possible without changing semantics.
   *
   * @param method - RPC method name.
   * @param input$ - Observable stream of request payloads to send to the server.
   * @returns Observable stream of response payloads from the server.
   */
  streamStream<Request, Response>(
    method: string,
    input$: Observable<Request>
  ): Observable<Response> {
    return this.runRpc(method, input$, false)
  }

  /**
   * Unary RPC: send one request, receive one response.
   *
   * @param method - RPC method name.
   * @param request - Single request payload to send to the server.
   * @param options - Per-call options, including {@link DxLinkRpcCallOptions.retry}.
   * @returns Observable that emits one response value and completes.
   */
  requestResponse<Request, Response>(
    method: string,
    request: Request,
    options?: DxLinkRpcCallOptions
  ): Observable<Response> {
    return this.runRpc(method, of(request), options?.retry ?? false)
  }

  /**
   * Server-streaming RPC: send one request, receive a stream of responses.
   *
   * @param method - RPC method name.
   * @param request - Single request payload to send to the server.
   * @param options - Per-call options, including {@link DxLinkRpcCallOptions.retry}.
   * @returns Observable stream of response payloads, completes when the server closes the channel.
   */
  requestStream<Request, Response>(
    method: string,
    request: Request,
    options?: DxLinkRpcCallOptions
  ): Observable<Response> {
    return this.runRpc(method, of(request), options?.retry ?? false)
  }

  private runRpc<Request, Response>(
    method: string,
    input$: Observable<Request>,
    retry: boolean
  ): Observable<Response> {
    return new Observable<Response>((subscriber) => {
      const channel: DXLinkChannel = this.client.openChannel(
        this.service,
        { methodName: method },
        { reconnect: retry }
      )

      let inputSubscription: Subscription | undefined

      // Subscribe to input only when the channel reaches OPENED state.
      // Callers needing to emit values before the channel opens (or replay them on reconnect)
      // should wrap their input in a ReplaySubject — its replay buffer drains synchronously
      // when we subscribe here, and the values are sent immediately on the open channel.
      const subscribeToInput = () => {
        if (inputSubscription !== undefined) return

        inputSubscription = input$.subscribe({
          next: (value) => {
            try {
              channel.send({ type: CHANNEL_DATA_TYPE, payload: value })
            } catch (err) {
              subscriber.error(err)
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
          // Server confirmed the channel with CHANNEL_OPENED — subscribe input and start sending.
          case DXLinkChannelState.OPENED:
            subscribeToInput()
            break
          // Channel is re-requesting after a connection drop.
          // Unsubscribe input; on next OPENED we re-subscribe and a ReplaySubject input would
          // re-emit its buffered values automatically.
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
      // so subscribe to input now if the channel is already OPENED.
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
}
