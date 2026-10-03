import type { DescMethod, DescService, JsonValue, Message } from '@bufbuild/protobuf'
import type { DXLinkClient, DXLinkError } from '@dxfeed/dxlink-api'
import { DXLinkLogLevel } from '@dxfeed/dxlink-api'
import {
  FLUSH_INTERVAL,
  command,
  makeChannelAtoms,
  prependError,
  session,
} from '@dxfeed/dxlink-console-core'
import type { ChannelAtoms, Session } from '@dxfeed/dxlink-console-core'
import { createDXLinkDynamicService } from '@dxfeed/dxlink-protobuf-es'
import { Cause, Effect, Queue, Stream } from 'effect'
import type { Scope } from 'effect'
import * as Atom from 'effect/reactivity/Atom'
import { AtomRegistry } from 'effect/reactivity/AtomRegistry'
import { ReplaySubject } from 'rxjs'
import type { Observable } from 'rxjs'

import { formatMessage } from './descriptors'

/** One message exchanged on the call, kept as the protobuf-JSON that went over the wire. */
export interface RpcMessageEntry {
  /** Stable identity for React keys — entries are prepended. */
  id: number
  time: string
  json: JsonValue
}

export type RpcCallState = 'active' | 'completed' | 'failed'

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

/** Prepend entries, newest first, capped at {@link MAX_RESPONSES}. */
const prepend = (
  entries: readonly RpcMessageEntry[],
  added: readonly RpcMessageEntry[]
): RpcMessageEntry[] => [...added, ...entries].slice(0, MAX_RESPONSES)

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

/** What the call's Observable said, as data — so a failure travels in order with the rest. */
type Notification =
  | { readonly _tag: 'Next'; readonly message: Message }
  | { readonly _tag: 'Error'; readonly error: unknown }
  | { readonly _tag: 'Complete' }

/**
 * Subscribe to the call's responses for as long as the calling scope lives, as a Stream of
 * {@link Notification}s.
 *
 * Subscribing is what makes the call, so it happens right here rather than when a consumer
 * first pulls. The stream never fails: an error is one more notification, delivered after every
 * response that came before it — a coalescing window must not drop those on the way out.
 * Ending the scope unsubscribes, which cancels the RPC.
 */
const notifications = (
  responses: Observable<Message>
): Effect.Effect<Stream.Stream<Notification>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<Notification, Cause.Done>()
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        responses.subscribe({
          next: (message) => {
            Queue.offerUnsafe(queue, { _tag: 'Next', message })
          },
          error: (error: unknown) => {
            Queue.offerUnsafe(queue, { _tag: 'Error', error })
            Queue.endUnsafe(queue)
          },
          complete: () => {
            Queue.offerUnsafe(queue, { _tag: 'Complete' })
            Queue.endUnsafe(queue)
          },
        })
      ),
      (subscription) => Effect.sync(() => subscription.unsubscribe())
    )

    return Stream.fromQueue(queue)
  })

/**
 * What reads and writes atoms: the registry inside the session, a command's write context
 * inside `send`. Both have this shape, so the helpers below take either.
 */
interface Atoms {
  get<A>(atom: Atom.Atom<A>): A
  set<R, W>(atom: Atom.Writable<R, W>, value: W): void
}

/** A call in flight: its responses, and for a bidirectional method the request stream. */
interface Call {
  readonly input: ReplaySubject<Record<string, unknown>> | null
  readonly responses: Observable<Message>
}

/** One RPC call: a method of a protobuf service, bound to the connection. */
export interface RpcModel {
  readonly channel: ChannelAtoms
  /** Holds the call. For a bidirectional method, what it holds is the request stream. */
  readonly session: Session<ReplaySubject<Record<string, unknown>> | null>
  readonly callState: Atom.Atom<RpcCallState>
  /** Responses received, newest first. */
  readonly responses: Atom.Atom<readonly RpcMessageEntry[]>
  /** Requests sent, newest first. More than one only for bidirectional methods. */
  readonly requests: Atom.Atom<readonly RpcMessageEntry[]>
  /**
   * Send another request on a bidirectional call. Rejected messages are reported as errors
   * on this channel rather than thrown, so a typo in the editor cannot take the card down.
   */
  readonly send: Atom.Writable<void, Message>
}

/**
 * The model for one RPC call — binds a protobuf service descriptor to the connection with
 * {@link createDXLinkDynamicService} and drives a single method of it.
 *
 * The call is made when the session opens and cancelled when it closes, so the channel is
 * released with the card.
 */
export const makeRpcModel = (
  client: DXLinkClient,
  params: { service: DescService; method: DescMethod; request: Message }
): RpcModel => {
  const { service, method, request } = params
  const channel = makeChannelAtoms()
  const callState = Atom.make<RpcCallState>('active')
  const responses = Atom.make<readonly RpcMessageEntry[]>([])
  const requests = Atom.make<readonly RpcMessageEntry[]>([])

  const fail = (atoms: Atoms, error: unknown) => {
    atoms.set(callState, 'failed')
    atoms.set(channel.errors, prependError(atoms.get(channel.errors), toDXLinkError(error)))
  }

  /** Put a request on the wire (or a unary call's one request, already sent) and log it. */
  const emit = (
    atoms: Atoms,
    input: ReplaySubject<Record<string, unknown>> | null,
    message: Message
  ) => {
    try {
      input?.next(message as Record<string, unknown>)
      atoms.set(
        requests,
        prepend(atoms.get(requests), [entry(formatMessage(method.input, message))])
      )
    } catch (error) {
      fail(atoms, error)
    }
  }

  /**
   * Bind the descriptor and invoke the method. Both can throw — a method the wire cannot
   * carry, a request the binding rejects.
   */
  const startCall = (): Call => {
    const bound = createDXLinkDynamicService(client, service, {
      // A descriptor chosen at runtime may declare methods the wire cannot carry; the picker
      // never offers them, and the rest of the service stays callable.
      skipUnsupportedMethods: true,
      // A debug console wants the protocol traffic in the browser log.
      logLevel: DXLinkLogLevel.DEBUG,
    })
    const invoke = bound[method.localName]
    if (invoke === undefined) {
      throw new Error(`${service.typeName} does not expose ${method.name}`)
    }

    if (method.methodKind === 'bidi_streaming') {
      // `DxLinkRpcService` subscribes to the request stream only once the channel is OPENED, so
      // values emitted before that would be dropped. A ReplaySubject holds them until then —
      // and replays them if the channel re-opens after a drop.
      const input = new ReplaySubject<Record<string, unknown>>()

      return { input, responses: invoke(input) }
    }

    return { input: null, responses: invoke(request as Record<string, unknown>) }
  }

  const callSession = session({
    state: [channel.errors, callState, responses, requests],
    open: (get) => {
      if (get(channel.closed)) {
        return Effect.succeed(null)
      }

      return Effect.gen(function* () {
        const registry = yield* AtomRegistry

        let call: Call
        try {
          call = startCall()
        } catch (error) {
          // This call's failure, shown on its card — not a session failure, which would take
          // the card down with it.
          fail(registry, error)

          return null
        }

        const received = yield* notifications(call.responses)
        const input = call.input
        if (input !== null) {
          yield* Effect.addFinalizer(() => Effect.sync(() => input.complete()))
        }
        emit(registry, input, request)

        yield* received.pipe(
          Stream.groupedWithin(Number.POSITIVE_INFINITY, FLUSH_INTERVAL),
          Stream.runForEach((batch) =>
            Effect.sync(() => {
              const added: RpcMessageEntry[] = []
              for (const notification of batch) {
                if (notification._tag === 'Next') {
                  try {
                    added.unshift(entry(formatMessage(method.output, notification.message)))
                  } catch (error) {
                    fail(registry, error)
                  }
                } else if (notification._tag === 'Error') {
                  fail(registry, notification.error)
                } else {
                  registry.set(callState, 'completed')
                }
              }
              if (added.length > 0) {
                registry.set(responses, prepend(registry.get(responses), added))
              }
            })
          ),
          Effect.forkScoped
        )

        return call.input
      })
    },
  })

  return {
    channel,
    session: callSession,
    callState,
    responses,
    requests,
    send: command((ctx, message: Message) => {
      // Only a bidirectional call holds a request stream; any other holds `null`.
      const input = callSession.current()
      if (input === null || input === undefined) return
      emit(ctx, input, message)
    }),
  }
}
