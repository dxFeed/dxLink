import { Option, Predicate } from 'effect'
import { ReplaySubject } from 'rxjs'

import type { DescMethod, DescService, Message } from '@bufbuild/protobuf'
import { type DXLinkClient, DXLinkLogLevel } from '@dxfeed/dxlink-api'
import { createDXLinkDynamicService } from '@dxfeed/dxlink-protobuf-es'

import { formatMessage, stringifyJson } from './descriptors'
import type { CallEvent, CallHandle } from './service'

/**
 * A call's failure as a protocol error.
 *
 * The interaction models carry errors differently from the other services: there is no
 * channel object to listen on, the failure arrives on the Observable. An error from the
 * server already has a type and a message and is forwarded as it is; anything else — a
 * decode failure, say — is reported as UNKNOWN.
 */
export const describeCallFailure = (error: unknown): Readonly<{ type: string; message: string }> =>
  Predicate.hasProperty(error, 'type') &&
  Predicate.isString(error.type) &&
  Predicate.hasProperty(error, 'message') &&
  Predicate.isString(error.message)
    ? { type: error.type, message: error.message }
    : {
        type: 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error),
      }

/** A message as the protobuf-JSON text that crosses the wire. */
export const formatWireJson = (method: DescMethod, message: Message): string =>
  stringifyJson(formatMessage(method.input, message))

/**
 * Bind a service descriptor to the connection and call one method of it.
 *
 * Each call opens its own channel; cancelling the call releases it. Everything the call
 * reports afterwards goes to `emit`. Throws when the call cannot be made at all.
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
  emit: (event: CallEvent) => void
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
        emit({
          _tag: 'Response',
          json: stringifyJson(formatMessage(method.output, response)),
        })
      } catch (error) {
        emit({ _tag: 'Failed', ...describeCallFailure(error) })
      }
    },
    error: (error: unknown) => {
      emit({ _tag: 'Failed', ...describeCallFailure(error) })
    },
    complete: () => {
      emit({ _tag: 'Ended' })
    },
  })

  return {
    method,
    maybeSend: Option.map(maybeInput, (input) => (message: Message) => {
      input.next({ ...message })
    }),
    stop: () => {
      Option.match(maybeInput, {
        onNone: () => undefined,
        onSome: (input) => {
          input.complete()
        },
      })
      subscription.unsubscribe()
    },
  }
}
