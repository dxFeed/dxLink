import type { DescMethod, DescService, JsonValue, Message } from '@bufbuild/protobuf'
import type { DXLinkClient, DXLinkError } from '@dxfeed/dxlink-api'
import { DXLinkLogLevel } from '@dxfeed/dxlink-api'
import { createDXLinkDynamicService } from '@dxfeed/dxlink-protobuf-es'
import { ReplaySubject, type Subscription } from 'rxjs'
import { createStore } from 'zustand/vanilla'

import { formatMessage } from './descriptors'
import { prependError } from '../../shared/lib/timestamped-error'
import type { TimestampedError } from '../../shared/lib/timestamped-error'
import type { ViewModel } from '../../shared/view-model'

/** One message exchanged on the call, kept as the protobuf-JSON that went over the wire. */
export interface RpcMessageEntry {
  /** Stable identity for React keys — entries are prepended. */
  id: number
  time: string
  json: JsonValue
}

export type RpcCallState = 'active' | 'completed' | 'failed'

export interface RpcVMState {
  callState: RpcCallState
  /** Responses received, newest first. */
  responses: RpcMessageEntry[]
  /** Requests sent, newest first. More than one only for bidirectional methods. */
  requests: RpcMessageEntry[]
  errors: TimestampedError[]
}

// Coalesce responses arriving within this window into one store update (~10fps).
const FLUSH_INTERVAL_MS = 100

/**
 * How many responses one call retains. A streaming RPC left open produces an unbounded
 * number of them, and only the most recent are useful in a console.
 */
export const MAX_RESPONSES = 200

let lastEntryId = 0

const entry = (json: JsonValue): RpcMessageEntry => {
  lastEntryId += 1

  return { id: lastEntryId, time: new Date().toLocaleTimeString(), json }
}

/**
 * The interaction models carry errors differently from the other services: there is no
 * channel object to listen on, the failure arrives on the Observable. A `DXLinkError` from
 * the server is forwarded as-is; anything else (a decode failure, say) is reported as UNKNOWN.
 */
const toDXLinkError = (error: unknown): DXLinkError => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return error as DXLinkError
  }

  return { type: 'UNKNOWN', message: error instanceof Error ? error.message : String(error) }
}

/**
 * ViewModel for one RPC call — binds a protobuf service descriptor to the connection with
 * {@link createDXLinkDynamicService} and drives a single method of it.
 *
 * Construction is PURE (StrictMode-safe); the call is made in {@link start} and cancelled in
 * {@link stop}, driven by the view's `useEffect`. Unsubscribing cancels the RPC, so the
 * channel is released with the card.
 */
export class RpcViewModel implements ViewModel<RpcVMState> {
  readonly store = createStore<RpcVMState>(() => ({
    callState: 'active',
    responses: [],
    requests: [],
    errors: [],
  }))

  private readonly client: DXLinkClient
  private readonly service: DescService
  private readonly method: DescMethod
  private readonly request: Message

  private subscription: Subscription | null = null
  /** Request stream for bidirectional methods; null for the other models. */
  private input: ReplaySubject<Record<string, unknown>> | null = null
  private pending: RpcMessageEntry[] = []
  private flushHandle: ReturnType<typeof setTimeout> | null = null

  constructor(
    client: DXLinkClient,
    params: { service: DescService; method: DescMethod; request: Message }
  ) {
    this.client = client
    this.service = params.service
    this.method = params.method
    this.request = params.request
  }

  get isBidirectional(): boolean {
    return this.method.methodKind === 'bidi_streaming'
  }

  start = (): void => {
    if (this.subscription !== null) return

    // A start after a stop is a new call on a new channel, so it gets a new log. Without
    // this the request would appear twice on every card: React 19 StrictMode mounts,
    // unmounts and remounts the view, and the store outlives that cycle.
    this.store.setState({ callState: 'active', responses: [], requests: [], errors: [] })

    let responses
    try {
      const service = createDXLinkDynamicService(this.client, this.service, {
        // A descriptor chosen at runtime may declare methods the wire cannot carry; the
        // picker never offers them, and the rest of the service stays callable.
        skipUnsupportedMethods: true,
        // A debug console wants the protocol traffic in the browser log.
        logLevel: DXLinkLogLevel.DEBUG,
      })
      const call = service[this.method.localName]
      if (call === undefined) {
        throw new Error(`${this.service.typeName} does not expose ${this.method.name}`)
      }

      if (this.isBidirectional) {
        // `DxLinkRpcService` subscribes to the request stream only once the channel is
        // OPENED, so values emitted before that would be dropped. A ReplaySubject holds
        // them until then — and replays them if the channel re-opens after a drop.
        this.input = new ReplaySubject<Record<string, unknown>>()
        responses = call(this.input)
        this.emit(this.request)
      } else {
        responses = call(this.request as Record<string, unknown>)
        this.record('requests', formatMessage(this.method.input, this.request))
      }
    } catch (error) {
      this.fail(error)
      return
    }

    this.subscription = responses.subscribe({
      next: (message) => this.handleResponse(message),
      error: (error: unknown) => this.fail(error),
      complete: () => this.store.setState({ callState: 'completed' }),
    })
  }

  stop = (): void => {
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    this.pending = []
    this.input?.complete()
    this.input = null
    this.subscription?.unsubscribe()
    this.subscription = null
  }

  /**
   * Send another request on a bidirectional call. Rejected messages are reported as errors
   * on this channel rather than thrown, so a typo in the editor cannot take the card down.
   */
  send = (message: Message): void => {
    if (!this.isBidirectional || this.input === null) return
    this.emit(message)
  }

  clearErrors = (): void => {
    this.store.setState({ errors: [] })
  }

  close = (): void => {
    this.stop()
  }

  dispose = (): void => {
    this.stop()
  }

  private emit = (message: Message): void => {
    try {
      this.input?.next(message as Record<string, unknown>)
      this.record('requests', formatMessage(this.method.input, message))
    } catch (error) {
      this.fail(error)
    }
  }

  private fail = (error: unknown): void => {
    this.store.setState((state) => ({
      callState: 'failed',
      errors: prependError(state.errors, toDXLinkError(error)),
    }))
  }

  private handleResponse = (message: Message): void => {
    let json: JsonValue
    try {
      json = formatMessage(this.method.output, message)
    } catch (error) {
      this.fail(error)
      return
    }

    this.pending = [entry(json), ...this.pending]
    if (this.flushHandle === null) {
      this.flushHandle = setTimeout(this.flush, FLUSH_INTERVAL_MS)
    }
  }

  private flush = (): void => {
    this.flushHandle = null
    const pending = this.pending
    if (pending.length === 0) return
    this.pending = []
    this.store.setState((state) => ({
      responses: [...pending, ...state.responses].slice(0, MAX_RESPONSES),
    }))
  }

  private record = (key: 'requests' | 'responses', json: JsonValue): void => {
    this.store.setState((state) => ({
      [key]: [entry(json), ...state[key]].slice(0, MAX_RESPONSES),
    }))
  }
}
