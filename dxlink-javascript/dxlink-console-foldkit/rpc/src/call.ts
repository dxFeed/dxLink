import { Option, Predicate } from 'effect'
import { ReplaySubject } from 'rxjs'

import type { DescMethod, DescService, Message } from '@bufbuild/protobuf'
import { type DXLinkClient, DXLinkLogLevel } from '@dxfeed/dxlink-api'
import { createDXLinkDynamicService } from '@dxfeed/dxlink-protobuf-es'

import { Descriptors } from './domain'
import type { CallHandle } from './service'

/** What a live call reports on its own, before it is stamped with a time. */
export type CallEvent =
  | Readonly<{ _tag: 'Response'; json: string }>
  | Readonly<{ _tag: 'Ended' }>
  | Readonly<{ _tag: 'Failed'; type: string; message: string }>

/** Why a call could not be made or continued, in the shape of a protocol error. */
export type CallFailure = Readonly<{ type: string; message: string }>

/** A failure the console found on its own side, which has no protocol error type. */
export const unknownFailure = (message: string): CallFailure => ({ type: 'UNKNOWN', message })

/**
 * A call's failure as a protocol error.
 *
 * The interaction models carry errors differently from the other services: there is no
 * channel object to listen on, the failure arrives on the Observable. An error from the
 * server already has a type and a message and is forwarded as it is; anything else — a
 * decode failure, say — is reported as UNKNOWN.
 */
export const describeCallFailure = (error: unknown): CallFailure =>
  Predicate.hasProperty(error, 'type') &&
  Predicate.isString(error.type) &&
  Predicate.hasProperty(error, 'message') &&
  Predicate.isString(error.message)
    ? { type: error.type, message: error.message }
    : unknownFailure(error instanceof Error ? error.message : String(error))

/** A message as the protobuf-JSON text that crosses the wire. */
export const formatWireJson = (method: DescMethod, message: Message): string =>
  Descriptors.stringifyJson(Descriptors.formatMessage(method.input, message))

/**
 * Bind a service descriptor to the connection and call one method of it.
 *
 * Each call opens its own channel; cancelling the call releases it. Everything the call
 * reports afterwards goes to `onEvent`. Throws when the call cannot be made at all.
 *
 * A bidirectional call takes a stream of requests, and the transport subscribes to it only
 * once the channel is opened. A `ReplaySubject` holds what was sent before that — and
 * replays it if the channel re-opens after a drop.
 */
export const startCall = (
  client: DXLinkClient,
  service: DescService,
  method: DescMethod,
  request: Message,
  onEvent: (event: CallEvent) => void
): CallHandle => {
  const bound = createDXLinkDynamicService(client, service, {
    // NOTE: a descriptor chosen at runtime may declare methods the wire cannot carry; the
    // picker never offers them, and the rest of the service stays callable.
    skipUnsupportedMethods: true,
    logLevel: DXLinkLogLevel.DEBUG,
  })
  const call = bound[method.localName]
  if (call === undefined) {
    throw new Error(`${service.typeName} does not expose ${method.name}`)
  }

  const maybeInput =
    method.methodKind === 'bidi_streaming'
      ? Option.some(new ReplaySubject<Record<string, unknown>>())
      : Option.none()

  const responses = Option.match(maybeInput, {
    onNone: () => call({ ...request }),
    onSome: (input) => {
      const output = call(input)
      input.next({ ...request })

      return output
    },
  })

  const subscription = responses.subscribe({
    next: (response) => {
      try {
        onEvent({
          _tag: 'Response',
          json: Descriptors.stringifyJson(Descriptors.formatMessage(method.output, response)),
        })
      } catch (error) {
        onEvent({ _tag: 'Failed', ...describeCallFailure(error) })
      }
    },
    error: (error: unknown) => {
      onEvent({ _tag: 'Failed', ...describeCallFailure(error) })
    },
    complete: () => {
      onEvent({ _tag: 'Ended' })
    },
  })

  return {
    method,
    maybeSend: Option.map(maybeInput, (input) => (message: Message) => {
      input.next({ ...message })
    }),
    // NOTE: the subscription is released even when completing the request stream throws, so
    // a failed stop never leaves the call listening.
    stop: () => {
      try {
        Option.match(maybeInput, {
          onNone: () => undefined,
          onSome: (input) => {
            input.complete()
          },
        })
      } finally {
        subscription.unsubscribe()
      }
    },
  }
}
